import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { readCitationContext } from "../../src/server/citation-context";
import { createEmptyProvenance } from "../../src/contracts";
import type { verifiedSession } from "../../src/lib/supabase/server";
it("resolves only referenced company-scoped historical support without changing entry claims", async () => {
  const root = createEmptyProvenance();
  const old = createEmptyProvenance();
  const rootId = "11111111-1111-4111-8111-111111111111";
  const factId = "22222222-2222-4222-8222-222222222222";
  const sourceId = "33333333-3333-4333-8333-333333333333";
  const evidenceId = "44444444-4444-4444-8444-444444444444";
  root.claims = [
    {
      id: rootId,
      entry_id: rootId,
      targets: ["/positioning/company_pitch"],
      origin: "generated",
      evidence_ids: [],
      based_on_claim_ids: [factId],
      actor_id: null,
      authored_at: null,
      note: null,
    },
  ];
  old.claims = [
    {
      ...root.claims[0],
      id: factId,
      origin: "source_backed",
      targets: ["/company_foundation/overview"],
      based_on_claim_ids: [],
      evidence_ids: [evidenceId],
    },
  ];
  old.sources = [
    {
      id: sourceId,
      url: "https://example.com/",
      title: "Original source",
      author: null,
      site_name: null,
      published_on: null,
      retrieved_at: "2026-10-16T00:00:00Z",
    },
  ];
  old.evidence = [
    {
      id: evidenceId,
      source_page_id: sourceId,
      kind: "text",
      excerpt: "The exact original supporting fact.",
      technical: null,
    },
  ];
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { provenance: old }, error: null }),
  };
  const client = { from: vi.fn().mockReturnValue(query) } as unknown as Awaited<
    ReturnType<typeof verifiedSession>
  >["client"];
  const context = await readCitationContext(client, rootId, [root]);
  expect(query.eq).toHaveBeenCalledWith("company_id", rootId);
  expect(query.contains).toHaveBeenCalledWith("provenance", {
    claims: [{ id: factId }],
  });
  expect(context.claims.map((claim) => claim.id)).toEqual([rootId, factId]);
  expect(context.evidence).toEqual(old.evidence);
  expect(context.sources).toEqual(old.sources);
  expect(root.claims).toHaveLength(1);
});

import { readSourceCoverage, readSourceCapture, projectSourceCoverage } from "../../src/server/source-coverage";
import { GET as getSourceCapture } from "../../src/app/api/companies/[companyId]/sources/[sourceId]/route";
import { verifiedSession as authenticate } from "../../src/lib/supabase/server";

const coverageCompany = "11111111-1111-4111-8111-111111111111";
const coverageJob = "22222222-2222-4222-8222-222222222222";
const coverageSource = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-10-16T00:00:00Z";
function sourceQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
}
const inventoryJob = {
  id: coverageJob, status: "partial", created_at: timestamp, updated_at: timestamp,
  options: { max_pages: 4 },
  progress: { discovered: 6, selected: 4, captured: 1, failed: 1, blocked: 1, extracted: 1, document_limit: 4, limits_reached: ["documents"] },
  checkpoint: { lease_token: "never-forward-this", validated_candidates: [{ private: "never-forward-candidates" }],
    frontier: { root: "https://example.com/", selected: 4, limitsReached: ["documents"],
      seen: ["https://example.com/", "https://example.com/failed", "https://example.com/blocked", "https://example.com/selected", "https://example.com/about", "https://example.com/blog"],
      aliases: [], pending: [{ url: "https://example.com/blog", depth: 1, score: 10 }, { url: "https://example.com/about", depth: 1, score: 100 }],
    } },
  errors: [
    { code: "capture_failed", url: "https://example.com/failed", retryable: false, message: "Capture failed." },
    { code: "robots_blocked", url: "https://example.com/blocked", retryable: false, message: "Robots policy blocked capture." },
    { code: "render_unavailable", url: "https://example.com/", retryable: false, message: "Browser observations unavailable." },
  ],
};
const inventorySource = { id: coverageSource, scrape_job_id: coverageJob, normalized_url: "https://example.com/", final_url: "https://example.com/",
  title: "Uncited captured page", retrieved_at: timestamp, capture_status: "captured" as const, error_code: null };

it("projects latest-crawl source outcomes and ranked unselected URLs without leaking checkpoint payloads", async () => {
  const members = sourceQuery({ role: "viewer" }), jobs = sourceQuery(inventoryJob), pages = sourceQuery([inventorySource]);
  const client = { from: vi.fn((table: string) => ({ company_members: members, scrape_jobs: jobs, source_pages: pages })[table]) } as unknown as Awaited<ReturnType<typeof verifiedSession>>["client"];
  const coverage = await readSourceCoverage(client, coverageCompany, coverageCompany);
  expect(coverage.job).toMatchObject({ documentLimit: 4, limitsReached: ["documents"] });
  expect(coverage.pages.map((page) => page.state)).toEqual(["captured", "failed", "blocked", "linked_not_selected", "linked_not_selected", "selected_no_capture"]);
  expect(coverage.pages.filter((page) => page.state === "linked_not_selected").map((page) => page.url)).toEqual(["https://example.com/about", "https://example.com/blog"]);
  expect(coverage.pages[0]).toMatchObject({ sourceId: coverageSource, state: "captured", reason: "Browser observations unavailable." });
  expect(pages.eq).toHaveBeenCalledWith("company_id", coverageCompany);
  expect(pages.eq).toHaveBeenCalledWith("scrape_job_id", coverageJob);
  expect(JSON.stringify(coverage)).not.toContain("never-forward");
  const running = projectSourceCoverage({ ...inventoryJob, status: "crawling" }, [inventorySource]);
  expect(running.pages.find((page) => page.url.endsWith("/about"))).toMatchObject({ state: "pending", selected: null });
});

it("requires membership before reading any source inventory or full retained text", async () => {
  const members = sourceQuery(null);
  const from = vi.fn().mockReturnValue(members);
  const client = { from } as unknown as Awaited<ReturnType<typeof verifiedSession>>["client"];
  await expect(readSourceCoverage(client, coverageCompany, coverageCompany)).rejects.toMatchObject({ status: 404 });
  await expect(readSourceCapture(client, coverageCompany, coverageSource, coverageCompany)).rejects.toMatchObject({ status: 404 });
  expect(from.mock.calls.every(([table]) => table === "company_members")).toBe(true);
});

it("returns exact immutable source text as authenticated JSON with company and source filtering", async () => {
  const text = '<script>alert("untrusted source text")</script>\nA complete retained passage.';
  const members = sourceQuery({ role: "viewer" });
  const sources = sourceQuery({ ...inventorySource, cleaned_content: text,
    observations: { segments: [{ id: "s1", text }], truncated: true, limitations: ["Capture reached its text limit."], html: "not part of the response" } });
  const client = { from: vi.fn((table: string) => table === "company_members" ? members : sources) } as unknown as Awaited<ReturnType<typeof verifiedSession>>["client"];
  vi.mocked(authenticate).mockResolvedValue({ client, user: { id: coverageCompany } } as never);
  const response = await getSourceCapture(new Request("https://app.example/api/source"), { params: Promise.resolve({ companyId: coverageCompany, sourceId: coverageSource }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const { data } = await response.json();
  expect(data).toMatchObject({ id: coverageSource, jobId: coverageJob, text, truncated: true, limitations: ["Capture reached its text limit."] });
  expect(data).not.toHaveProperty("observations");
  expect(data).not.toHaveProperty("html");
  expect(sources.eq).toHaveBeenCalledWith("company_id", coverageCompany);
  expect(sources.eq).toHaveBeenCalledWith("id", coverageSource);
});
