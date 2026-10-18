import { expect, it, vi } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { extractAndFinish, EXTRACTOR_VERSION } from "../../src/worker/extract/pipeline";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import { technicalObservations } from "../../src/worker/extract/observations";
import { stableId } from "../../src/worker/extract/identity";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import type { CrawlResult } from "../../src/worker/crawl/run-crawl";
import type { FieldCandidate } from "../../src/worker/extract/types";
import { CheckpointSchema } from "../../src/contracts";

const companyId = stableId("checkpoint-company");
const job = { id: stableId("checkpoint-job"), company_id: companyId } as Job;
const page = {
  id: stableId("checkpoint-source"),
  retrievedAt: "2026-10-16T00:00:00.000Z",
  capture: captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: "<html><title>Example</title><body><p>Example company</p></body></html>" }),
};
function crawl(checkpoint: Record<string, unknown> = {}): CrawlResult {
  return {
    captures: [page], errors: [],
    checkpoint: {
      effectiveRoot: page.capture.finalUrl,
      frontier: {
        root: page.capture.finalUrl, pending: [], seen: [page.capture.finalUrl],
        aliases: [], selected: 1, limitsReached: [],
      },
      budgets: { documents: 1, htmlBytes: 200, designBytes: 0, startedAt: Date.parse(page.retrievedAt), limitsReached: [] },
      captured_source_ids: [page.id], errors: [],
      ...checkpoint,
    },
    progress: { stage: "crawling", discovered: 1, selected: 1, captured: 1, failed: 0, blocked: 0, extracted: 0, document_limit: 10, limits_reached: [] },
  };
}
function repository() {
  return {
    checkpoint: vi.fn().mockImplementation(async (_job, checkpoint) => {
      // Enforce the same strict durable contract as PostgresJobRepository.
      CheckpointSchema.parse(checkpoint);
      return {};
    }),
    finish: vi.fn().mockResolvedValue({}),
  } as unknown as JobRepository;
}

it("reparses a checkpoint with non-source candidates and resumes deterministic checkpoints without changing results", async () => {
  const repo = repository();
  const old = {
    extracted_source_ids: [page.id],
    validated_candidates: [{
      id: stableId("retired-model-candidate"), entryId: stableId(companyId, "positioning", "singleton"),
      kind: "positioning", fieldName: "company_pitch", field: "/positioning/company_pitch",
      value: "Retired generated pitch", origin: "generated", entity_key: null,
      sourceId: page.id, segment_ids: [], observation_ids: [], evidenceIds: [],
      supporting_fields: [], note: "Retired model output",
    }],
  };
  const first = await extractAndFinish(job, repo, crawl(old), new AbortController().signal);
  expect(first.find((p) => p.kind === "company_foundation")?.content).toMatchObject({ website: "https://example.com/" });
  expect(first.find((p) => p.kind === "positioning")?.content).toMatchObject({ company_pitch: null });
  expect(first.flatMap((p) => p.provenance.claims).every((c) => c.origin === "source_backed")).toBe(true);
  const checkpoint = vi.mocked(repo.checkpoint).mock.calls.at(-1)![1];
  expect(checkpoint.extractor_version).toBe(EXTRACTOR_VERSION);
  expect(checkpoint.errors).toEqual([]);
  expect(checkpoint.validated_candidates).not.toEqual(old.validated_candidates);
  expect(JSON.stringify(checkpoint)).not.toContain("Retired generated pitch");
  expect((checkpoint.validated_candidates as object[]).every((c) => !("page" in c))).toBe(true);
  const second = await extractAndFinish(job, repo, crawl(checkpoint), new AbortController().signal);
  expect(second).toEqual(first);
  expect(repo.finish).toHaveBeenCalledTimes(2);
});

it("rejects interpreted candidate origins before deterministic validation or reduction", () => {
  const candidate = {
    field: "/company_foundation/overview", entity_key: null, value: "Example company",
    origin: "generated", segment_ids: [page.capture.segments[0].id],
    observation_ids: [], supporting_fields: [], note: "Untrusted interpretation",
  } as unknown as FieldCandidate;
  expect(() => validateCandidates([candidate], page, technicalObservations(page), companyId)).toThrow();
});

it("reports capture failures separately while keeping unsupported fields unassessed", async () => {
  const repo = repository();
  const limited = crawl();
  limited.errors.push({ code: "render_unavailable", retryable: false, url: page.capture.finalUrl, message: "Browser observations were unavailable." });
  const proposals = await extractAndFinish(job, repo, limited, new AbortController().signal);
  const coverage = proposals.flatMap((p) => p.provenance.coverage);
  expect(coverage.find((c) => c.targets.includes("/company_foundation/year_founded"))?.status).toBe("partial");
  expect(coverage.find((c) => c.targets.includes("/branding_and_style/writing_style_description"))?.status).toBe("not_checked");
  const checkpoint = vi.mocked(repo.checkpoint).mock.calls.at(-1)![1];
  expect(checkpoint.errors).toEqual(limited.errors);
});


it("reparses a source whose cached evidence no longer resolves in its capture", async () => {
  const repo = repository();
  const first = await extractAndFinish(job, repo, crawl(), new AbortController().signal);
  const checkpoint = structuredClone(vi.mocked(repo.checkpoint).mock.calls.at(-1)![1]);
  const candidates = checkpoint.validated_candidates as { observation_ids: string[] }[];
  candidates[0].observation_ids = ["missing-captured-observation"];
  const second = await extractAndFinish(job, repo, crawl(checkpoint), new AbortController().signal);
  expect(second).toEqual(first);
  const repaired = vi.mocked(repo.checkpoint).mock.calls.at(-1)![1];
  expect(JSON.stringify(repaired)).not.toContain("missing-captured-observation");
});

it("invalidates v5 rule caches even when their source IDs and origin still resolve", async () => {
  const repo = repository();
  const first = await extractAndFinish(job, repo, crawl(), new AbortController().signal);
  const checkpoint = structuredClone(vi.mocked(repo.checkpoint).mock.calls.at(-1)![1]);
  checkpoint.extractor_version = "deterministic-v5";
  const cached = checkpoint.validated_candidates as { field: string; value: unknown }[];
  cached[0].value = "Stale v5 wording";
  const second = await extractAndFinish(job, repo, crawl(checkpoint), new AbortController().signal);
  expect(second).toEqual(first);
  expect(JSON.stringify(vi.mocked(repo.checkpoint).mock.calls.at(-1)![1])).not.toContain("Stale v5 wording");
});

it("preserves ranked validated candidates through durable schema parsing and extraction resume", async () => {
  const observations = technicalObservations(page);
  const [ranked] = validateCandidates([{
    field: "/company_foundation/overview", priority: 95, entity_key: null,
    value: "Example company", origin: "source_backed", segment_ids: [page.capture.segments[0].id],
    observation_ids: [], supporting_fields: [], note: null,
  }], page, observations, companyId);
  const { page: _page, observations: _observations, ...candidate } = ranked;
  const repo = repository();
  const saved = crawl({ extractor_version: EXTRACTOR_VERSION, extracted_source_ids: [page.id],
    validated_candidates: [{ ...candidate, sourceId: page.id }] });
  const first = await extractAndFinish(job, repo, saved, new AbortController().signal);
  expect(first.find((proposal) => proposal.kind === "company_foundation")?.content).toMatchObject({ overview: "Example company" });
  const checkpoint = vi.mocked(repo.checkpoint).mock.calls.at(-1)![1];
  expect((checkpoint.validated_candidates as { priority: number }[])[0].priority).toBe(95);
  const second = await extractAndFinish(job, repo, crawl(checkpoint), new AbortController().signal);
  expect(second).toEqual(first);
});
