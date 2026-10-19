// Entry revisions saved before 0018 are immutable history
// and carry none of the new keys. The draft read path (and so the editor, preview and draft export of every existing company)
// must keep loading them, reading the missing fields as their defaults.
import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { GET as draft } from "../../src/app/api/companies/[companyId]/draft/route";
import { GET as document } from "../../src/app/api/companies/[companyId]/document/route";

type Json = Record<string, any>;
const companyId = "10000000-0000-4000-8000-0000000000e0";
const userId = "40000000-0000-4000-8000-0000000000e1";
const time = "2026-10-16T05:00:00Z";
const company = {
  id: companyId, name: "Legacy Draft Co", website_url: "https://legacy.example/", created_by: userId, creation_request_id: userId,
  created_at: time, updated_at: time, archived_at: null, draft_generation: 7, next_snapshot_version: 3,
};
const ids = { company_foundation: "30000000-0000-4000-8000-0000000000e1", online_presence: "30000000-0000-4000-8000-0000000000e2", key_person: "30000000-0000-4000-8000-0000000000e3", offering: "30000000-0000-4000-8000-0000000000e4" };
/** Content exactly as stored before 0018: none of revenue, phone, age, nationality, portrait, images. */
const stored: Record<string, Json> = {
  company_foundation: {
    overview: "Legacy Draft Co sells inventory software.", website: null, industry: null, business_model: null, company_role: [], year_founded: null,
    legal_entity_type: null, employee_count: null, main_address: null, other_locations: [], service_locations: [], alternative_company_names: [],
  },
  online_presence: { social_media_links: [] },
  key_person: { id: ids.key_person, name: "Alex Chen", title: "Founder", role: null, gender: null, background_or_relevance: null },
  offering: { id: ids.offering, name: "Shop Inventory", description: null, offering_type: null, category: null, features: [], pricing: null, url: null },
};
const claim = (n: number, entry: string, target: string) => ({
  id: `70000000-0000-4000-8000-0000000000${n}0`, entry_id: entry, targets: [target], origin: "user_provided", evidence_ids: [], based_on_claim_ids: [],
  actor_id: userId, authored_at: time, note: "Entered by hand.",
});
const provenanceOf = (kind: string): Json => ({
  sources: [], evidence: [], operations: [], conflicts: [], decisions: [], coverage: [],
  claims: [
    kind === "company_foundation" ? claim(1, ids[kind], "/company_foundation/overview")
    : kind === "key_person" ? claim(3, ids[kind], `/key_people/@${ids[kind]}/name`)
    : kind === "offering" ? claim(4, ids[kind], `/offerings/@${ids[kind]}/name`)
    : null,
  ].filter(Boolean),
});
function builder(table: string, rows: unknown, byEntry?: Record<string, unknown>) {
  const filters: Record<string, unknown> = {};
  const self: Json = {};
  const resolveOne = () => ({ data: byEntry ? byEntry[String(filters.entry_id)] ?? null : rows, error: null });
  for (const method of ["select", "order", "in", "contains", "limit"]) {
    self[method] = vi.fn().mockReturnValue(self);
  }
  self.eq = vi.fn((column: string, value: unknown) => { filters[column] = value; return self; });
  self.maybeSingle = vi.fn(async () => resolveOne());
  self.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  void table;
  return self;
}
function session() {
  const kinds = Object.keys(ids) as (keyof typeof ids)[];
  const revisions = Object.fromEntries(kinds.map((kind) => [ids[kind], {
    id: ids[kind], entry_id: ids[kind], company_id: companyId, revision: 2, schema_version: "1.0.0", author_id: userId, change_reason: "Saved before 0018.",
    created_at: time, review_status: "unreviewed", content: structuredClone(stored[kind]), provenance: provenanceOf(kind),
  }]));
  const entries = kinds.map((kind) => ({ id: ids[kind], kind, company_id: companyId, current_revision: 2, created_by: userId, created_at: time }));
  const client = {
    from: vi.fn((table: string) => table === "company_members" ? builder(table, { role: "viewer" })
      : table === "companies" ? builder(table, company)
      : table === "knowledge_entries" ? builder(table, entries)
      : table === "knowledge_entry_versions" ? builder(table, Object.values(revisions))
      : builder(table, [])),
    rpc: vi.fn(),
  };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: userId } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return client;
}
const params = { params: Promise.resolve({ companyId }) };
beforeEach(() => vi.clearAllMocks());

it("the draft endpoint loads entries saved before 0018 and reads the missing fields as defaults", async () => {
  session();
  const response = await draft(new Request("https://app.example/api/companies/x/draft"), params);
  expect(response.status, "the draft of an existing company must keep loading").toBe(200);
  const entries = (await response.json()).data.entries as Json[];
  expect(entries).toHaveLength(4);
  const byKind = Object.fromEntries(entries.map((entry) => [entry.kind, entry.content]));
  expect(byKind.company_foundation).toMatchObject({ overview: "Legacy Draft Co sells inventory software.", revenue: null });
  expect(byKind.online_presence).toMatchObject({ social_media_links: [], phone: null });
  expect(byKind.key_person).toMatchObject({ name: "Alex Chen", title: "Founder", age: null, nationality: null, portrait: null });
  expect(byKind.offering).toMatchObject({ name: "Shop Inventory", images: [] });
});

it("the draft export still renders such a company, without the new labels", async () => {
  session();
  const response = await document(new Request(`https://app.example/api/companies/${companyId}/document?versionId=draft&format=docx`), params);
  expect(response.status).toBe(200);
  const text = load(await (await JSZip.loadAsync(await response.arrayBuffer())).file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  expect(text).toContain("Legacy Draft Co sells inventory software.");
  expect(text).toContain("Alex Chen");
  const body = text.split("Coverage & unknowns")[0];
  for (const label of ["Revenue: ", "Phone: ", "Age: ", "Nationality: "]) {
    expect(body, label).not.toContain(label);
  }
});
