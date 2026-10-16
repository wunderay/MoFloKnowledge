import type { Job, JobRepository } from "../job-repository";
import type { CrawlResult } from "../crawl/run-crawl";
import type { ValidatedCandidate } from "./validate-candidates";
import { validateCandidates } from "./validate-candidates";
import { deterministicCandidates } from "./deterministic";
import { technicalObservations } from "./observations";
import { reduceCandidates } from "./reduce";
// Change this version when deterministic rules or checkpoint candidate formats change.
export const EXTRACTOR_VERSION = "deterministic-v1";
export async function extractAndFinish(
  job: Job,
  repository: JobRepository,
  crawl: CrawlResult,
  signal: AbortSignal,
) {
  const checkpoint = { ...crawl.checkpoint };
  // Model-era checkpoints are deliberately reparsed from immutable captures. Their
  // completed IDs and validated candidates must never enter this source-only run.
  const compatible = checkpoint.extractor_version === EXTRACTOR_VERSION;
  const completed = new Set(
    compatible
      ? (checkpoint.extracted_source_ids as string[] | undefined) ?? []
      : [],
  );
  const capturesById = new Map(crawl.captures.map((p) => [p.id, p]));
  const candidates: ValidatedCandidate[] = (
    compatible
      ? (checkpoint.validated_candidates as
          | (Omit<ValidatedCandidate, "page" | "observations"> & {
              sourceId: string;
            })[]
          | undefined) ?? []
      : []
  )
    .filter((c) => c.origin === "source_backed" && capturesById.has(c.sourceId))
    .map((c) => {
      const page = capturesById.get(c.sourceId)!;
      return {
        ...c,
        page,
        observations: technicalObservations(page).filter((o) =>
          c.observation_ids.includes(o.id),
        ),
      };
    });
  // Legacy counters and model failures are never active configuration or errors.
  delete checkpoint.model_tokens;
  delete checkpoint.model_successes;
  delete checkpoint.model_failures;
  const errors = crawl.errors.filter(
    (error) => compatible ||
      !["model_not_configured", "page_extraction_failed"].includes(error.code),
  );
  let partial = errors.length > 0 || crawl.progress.limits_reached.length > 0;
  crawl.progress.stage = "extracting";
  crawl.progress.extracted = completed.size;
  await repository.checkpoint(
    job,
    {
      ...checkpoint,
      extractor_version: EXTRACTOR_VERSION,
      stage: "extracting",
      extracted_source_ids: [...completed],
      validated_candidates: candidates.map(
        ({ page, observations: _observations, ...candidate }) => ({
          ...candidate, sourceId: page.id,
        }),
      ),
      errors,
    },
    crawl.progress,
  );
  for (const page of crawl.captures) {
    if (completed.has(page.id)) continue;
    signal.throwIfAborted();
    const observations = technicalObservations(page);
    const captureLimitations =
      (page.capture.observations.limitations as unknown[] | undefined) ?? [];
    if (
      captureLimitations.length ||
      observations.some((o) => o.property === "capture-limitation")
    ) {
      partial = true;
      errors.push({
        code: "capture_partial",
        url: page.capture.finalUrl,
        retryable: false,
        message:
          "Some captured text or design observations were unavailable or truncated.",
      });
    }
    let proposed = deterministicCandidates(page, observations);
    if (page.id !== crawl.captures[0]?.id)
      proposed = proposed.filter(
        (c) => c.field !== "/company_foundation/website",
      );
    let invalid = false;
    for (const candidate of proposed) {
      try {
        candidates.push(
          ...validateCandidates([candidate], page, observations, job.company_id),
        );
      } catch {
        invalid = true;
      }
    }
    if (invalid) {
      partial = true;
      errors.push({
        code: "deterministic_validation_failed",
        url: page.capture.finalUrl,
        retryable: false,
        message: "Some captured observations could not be validated.",
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
      extractor_version: EXTRACTOR_VERSION,
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
  const proposals = crawl.captures.length
    ? reduceCandidates(candidates, {
        companyId: job.company_id,
        jobId: job.id,
        partial,
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
