import { expect, it, vi } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { extractAndFinish, EXTRACTOR_VERSION } from "../../src/worker/extract/pipeline";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import { technicalObservations } from "../../src/worker/extract/observations";
import { stableId } from "../../src/worker/extract/identity";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import type { CrawlResult } from "../../src/worker/crawl/run-crawl";
import type { FieldCandidate } from "../../src/worker/extract/types";

const companyId = stableId("checkpoint-company");
const job = { id: stableId("checkpoint-job"), company_id: companyId } as Job;
const page = {
  id: stableId("checkpoint-source"),
  retrievedAt: "2026-10-16T00:00:00.000Z",
  capture: captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: "<html><title>Example</title><body><p>Example company</p></body></html>" }),
};
function crawl(checkpoint: Record<string, unknown> = {}): CrawlResult {
  return {
    captures: [page], errors: [], checkpoint,
    progress: { stage: "crawling", discovered: 1, selected: 1, captured: 1, failed: 0, blocked: 0, extracted: 0, document_limit: 10, limits_reached: [] },
  };
}
function repository() {
  return { checkpoint: vi.fn().mockResolvedValue({}), finish: vi.fn().mockResolvedValue({}) } as unknown as JobRepository;
}

it("reparses legacy model checkpoints and resumes deterministic checkpoints without changing results", async () => {
  const repo = repository();
  const old = {
    extracted_source_ids: [page.id], model_tokens: 100, model_successes: 1,
    validated_candidates: [{
      id: stableId("retired-model-candidate"), entryId: stableId(companyId, "positioning", "singleton"),
      kind: "positioning", fieldName: "company_pitch", field: "/positioning/company_pitch",
      value: "Retired generated pitch", origin: "generated", entity_key: null,
      sourceId: page.id, segment_ids: [], observation_ids: [], evidenceIds: [],
      supporting_fields: [], note: "Retired model output",
    }],
  };
  const legacy = crawl(old);
  legacy.errors.push({ code: "model_not_configured", retryable: false, url: page.capture.finalUrl, message: "Retired model configuration error" });
  const first = await extractAndFinish(job, repo, legacy, new AbortController().signal);
  expect(first.find((p) => p.kind === "company_foundation")?.content).toMatchObject({ website: "https://example.com/" });
  expect(first.find((p) => p.kind === "positioning")?.content).toMatchObject({ company_pitch: null });
  expect(first.flatMap((p) => p.provenance.claims).every((c) => c.origin === "source_backed")).toBe(true);
  const checkpoint = vi.mocked(repo.checkpoint).mock.calls.at(-1)![1];
  expect(checkpoint.extractor_version).toBe(EXTRACTOR_VERSION);
  expect(checkpoint).not.toHaveProperty("model_tokens");
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
