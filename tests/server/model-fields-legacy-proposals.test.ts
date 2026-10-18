// A scrape finished before 0019 stores proposal candidates without the model fields. Reading the job (and the dismiss and
// cancel routes, which answer with the job) must still work, the candidates reading the missing fields as defaults.
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { createEmptyProvenance } from "../../src/contracts";
import { mapDatabaseError } from "../../src/server/http";
import { GET as readJobRoute } from "../../src/app/api/companies/[companyId]/scrapes/[jobId]/route";
import { POST as cancelRoute } from "../../src/app/api/companies/[companyId]/scrapes/[jobId]/cancel/route";
import { POST as dismissRoute } from "../../src/app/api/companies/[companyId]/proposals/[proposalId]/dismiss/route";

type Json = Record<string, any>;
const companyId = "10000000-0000-4000-8000-0000000000d0";
const jobId = "20000000-0000-4000-8000-0000000000d1";
const userId = "40000000-0000-4000-8000-0000000000d2";
const personId = "30000000-0000-4000-8000-0000000000d3";
const time = "2026-10-16T05:00:00Z";
const candidate = (id: string, kind: string, content: Json): Json => ({
  id, kind, target_entry_id: null, base_revision: null, schema_version: "1.0.0", content, provenance: createEmptyProvenance(), conflicts: [], changes: [],
});
/** Candidates exactly as an earlier crawl stored them: none of revenue, phone, age, nationality, portrait, images. */
const stored = [
  candidate("50000000-0000-4000-8000-0000000000d4", "company_foundation", {
    overview: "Legacy Co sells software.", website: null, industry: null, business_model: null, company_role: [], year_founded: null,
    legal_entity_type: null, employee_count: null, main_address: null, other_locations: [], service_locations: [], alternative_company_names: [],
  }),
  candidate("50000000-0000-4000-8000-0000000000d5", "online_presence", { social_media_links: [] }),
  candidate("50000000-0000-4000-8000-0000000000d6", "key_person", { id: personId, name: "Alex Chen", title: null, role: null, gender: null, background_or_relevance: null }),
  candidate("50000000-0000-4000-8000-0000000000d7", "offering", { id: "30000000-0000-4000-8000-0000000000d8", name: "Shop", description: null, offering_type: null, category: null, features: [], pricing: null, url: null }),
];
const job = {
  id: jobId, company_id: companyId, status: "succeeded", progress: {}, errors: [], options: { max_pages: 10 }, cancel_requested_at: null, created_at: time, updated_at: time,
  proposals: { candidates: stored, decisions: [], coverage: [], initialized_entry_ids: [] },
};
function session() {
  const rows: Record<string, unknown> = { company_members: { role: "owner" }, scrape_jobs: structuredClone(job) };
  const client = {
    from: vi.fn((table: string) => {
      const query: Json = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: rows[table], error: null }) };
      return query;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: userId } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return client;
}
const params = { params: Promise.resolve({ companyId, jobId, proposalId: stored[0].id }) };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ORIGIN = "https://app.example";
});
const post = (body: unknown) => new Request("https://app.example/x", { method: "POST", headers: { origin: "https://app.example", "content-type": "application/json" }, body: JSON.stringify(body) });

describe("a job whose proposals were stored before 0019", () => {
  const expectDefaults = (candidates: Json[]) => {
    expect(candidates).toHaveLength(4);
    expect(candidates[0].content).toMatchObject({ overview: "Legacy Co sells software.", revenue: null });
    expect(candidates[1].content).toMatchObject({ social_media_links: [], phone: null });
    expect(candidates[2].content).toMatchObject({ name: "Alex Chen", age: null, nationality: null, portrait: null });
    expect(candidates[3].content).toMatchObject({ name: "Shop", images: [] });
  };
  it("GET the job answers 200 with the missing fields at their defaults", async () => {
    session();
    const response = await readJobRoute(new Request("https://app.example/x"), params);
    expect(response.status).toBe(200);
    expectDefaults((await response.json()).data.proposals.candidates);
  });
  it("dismiss answers 200 with the job", async () => {
    const client = session();
    const response = await dismissRoute(post({ jobId, reason: "Already reviewed" }), params);
    expect(client.rpc).toHaveBeenCalledWith("dismiss_proposal", expect.objectContaining({ p_job: jobId }));
    expect(response.status).toBe(200);
    expectDefaults((await response.json()).data.proposals.candidates);
  });
  it("cancel answers 200 with the job", async () => {
    session();
    const response = await cancelRoute(post({}), params);
    expect(response.status).toBe(200);
  });
  it("a candidate holding an invalid new value is still refused", async () => {
    const client = session();
    const bad = structuredClone(job);
    (bad.proposals.candidates[0].content as Json).revenue = "  ";
    client.from.mockImplementation((table: string) => {
      const query: Json = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "scrape_jobs" ? bad : { role: "owner" }, error: null }) };
      return query as never;
    });
    expect((await readJobRoute(new Request("https://app.example/x"), params)).status).toBe(503);
  });
});

it("a storage path under another company is a validation error (422), not a service error", () => {
  expect(mapDatabaseError({ code: "23514", message: "asset_company_mismatch" }).status).toBe(422);
});
