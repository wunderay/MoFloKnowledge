import type { Job, JobRepository } from "../job-repository";
import type { CrawlResult } from "../crawl/run-crawl";
import type { PageExtractor } from "../model/responses";
import type { ValidatedCandidate } from "./validate-candidates";
import { validateCandidates } from "./validate-candidates";
import { deterministicCandidates } from "./deterministic";
import { technicalObservations } from "./observations";
import { reduceCandidates } from "./reduce";
import { PROMPT_VERSION } from "../model/prompt";
export async function extractAndFinish(
  job: Job,
  repository: JobRepository,
  crawl: CrawlResult,
  signal: AbortSignal,
  extractor?: PageExtractor,
) {
  const checkpoint = { ...crawl.checkpoint };
  const completed = new Set(
    (checkpoint.extracted_source_ids as string[] | undefined) ?? [],
  );
  const capturesById = new Map(crawl.captures.map((p) => [p.id, p]));
  const candidates: ValidatedCandidate[] = (
    (checkpoint.validated_candidates as
      | (Omit<ValidatedCandidate, "page" | "observations"> & {
          sourceId: string;
        })[]
      | undefined) ?? []
  )
    .map((c) => {
      const page = capturesById.get(c.sourceId)!;
      return {
        ...c,
        page,
        observations: page
          ? technicalObservations(page).filter((o) =>
              c.observation_ids.includes(o.id),
            )
          : [],
      };
    })
    .filter((c) => Boolean(c.page));
  let tokens = Number(checkpoint.model_tokens ?? 0);
  let modelSuccesses = Number(checkpoint.model_successes ?? 0);
  let modelFailures = Number(checkpoint.model_failures ?? 0);
  const startedAt = Number(
    (checkpoint.budgets as { startedAt?: number } | undefined)?.startedAt ??
      Date.now(),
  );
  const errors = [...crawl.errors];
  let partial = errors.length > 0 || crawl.progress.limits_reached.length > 0;
  crawl.progress.stage = "extracting";
  await repository.checkpoint(
    job,
    { ...checkpoint, stage: "extracting" },
    crawl.progress,
  );
  for (const page of crawl.captures) {
    if (completed.has(page.id)) continue;
    signal.throwIfAborted();
    const observations = technicalObservations(page);
    let proposed = deterministicCandidates(page, observations);
    if (page.id !== crawl.captures[0]?.id)
      proposed = proposed.filter(
        (c) => c.field !== "/company_foundation/website",
      );
    try {
      candidates.push(
        ...validateCandidates(proposed, page, observations, job.company_id),
      );
    } catch {
      partial = true;
      errors.push({
        code: "deterministic_validation_failed",
        url: page.capture.finalUrl,
        retryable: false,
        message: "Some captured observations could not be validated.",
      });
    }
    if (extractor) {
      try {
        const remaining = startedAt + 300000 - Date.now();
        const estimate =
          2 *
          (Buffer.byteLength(
            JSON.stringify({ segments: page.capture.segments, observations }),
          ) +
            20000);
        if (remaining <= 0 || tokens + estimate > 120000)
          throw new Error("model_budget");
        tokens += estimate;
        const output = await extractor.extract(
          page,
          observations,
          AbortSignal.any([signal, AbortSignal.timeout(remaining)]),
        );
        if (output.tokensUsed !== undefined)
          tokens += output.tokensUsed - estimate;
        const validated = validateCandidates(
          output.candidates,
          page,
          observations,
          job.company_id,
        );
        candidates.push(...validated);
        modelSuccesses++;
        if (output.limitations.length) partial = true;
      } catch {
        if (signal.aborted) throw signal.reason;
        partial = true;
        modelFailures++;
        errors.push({
          code: "page_extraction_failed",
          url: page.capture.finalUrl,
          retryable: false,
          message: "Page extraction failed or returned invalid evidence.",
        });
      }
    } else {
      partial = true;
      errors.push({
        code: "model_not_configured",
        url: page.capture.finalUrl,
        retryable: false,
        message:
          "Model extraction is not configured; only deterministic observations are available.",
      });
    }
    if (
      Buffer.byteLength(
        JSON.stringify(
          candidates.map(
            ({ page: _page, observations: _observations, ...c }) => c,
          ),
        ),
      ) > 750000
    ) {
      for (let index = candidates.length - 1; index >= 0; index--)
        if (candidates[index].page.id === page.id) candidates.splice(index, 1);
      partial = true;
      errors.push({
        code: "extraction_checkpoint_limit",
        url: page.capture.finalUrl,
        retryable: false,
        message: "The bounded extraction checkpoint budget was reached.",
      });
    }
    completed.add(page.id);
    crawl.progress.extracted = completed.size;
    Object.assign(checkpoint, {
      model_tokens: tokens,
      model_successes: modelSuccesses,
      model_failures: modelFailures,
      stage: "extracting",
      extracted_source_ids: [...completed],
      validated_candidates: candidates.map(
        ({ page, observations: _observations, ...candidate }) => ({
          ...candidate,
          sourceId: page.id,
        }),
      ),
      errors,
    });
    await repository.checkpoint(job, checkpoint, crawl.progress);
  }
  signal.throwIfAborted();
  const proposals =
    crawl.captures.length &&
    !(extractor && modelFailures > 0 && modelSuccesses === 0)
      ? reduceCandidates(candidates, {
          companyId: job.company_id,
          jobId: job.id,
          partial,
          model: extractor?.model ?? "deterministic-only",
          promptVersion: PROMPT_VERSION,
        })
      : [];
  for (const proposal of proposals) {
    const existing = job.current_entries?.find(
      (entry) =>
        entry.kind === proposal.kind &&
        (!["key_person", "offering"].includes(entry.kind) ||
          entry.id === ("id" in proposal.content ? proposal.content.id : "")),
    );
    if (existing) {
      proposal.target_entry_id = existing.id;
      proposal.base_revision = existing.current_revision;
      for (const claim of proposal.provenance.claims)
        claim.entry_id = existing.id;
    }
  }
  const coverage = proposals.flatMap((p) => p.provenance.coverage);
  await repository.finish(job, proposals, coverage);
  return proposals;
}
