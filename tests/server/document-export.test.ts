import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import fixture from "../contracts/illustrative-export.json";
import { canonicalStringify } from "../../src/knowledge/canonical-json";
import { PDFDocument } from "pdf-lib";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { GET } from "../../src/app/api/companies/[companyId]/document/route";

const companyId = fixture.company_id;
const userId = fixture.provenance.company.snapshot_author_id;
const time = fixture.saved_at;
const { company: _company, entries: _entries, ...provenance } = fixture.provenance;
const company = {
  id: companyId, name: "Current draft company", website_url: "https://example.com/", created_by: userId,
  creation_request_id: userId, created_at: time, updated_at: time, archived_at: null,
  draft_generation: 4, next_snapshot_version: 2,
};
const entryId = fixture.provenance.entries[0].entry_id;
const revision = {
  id: entryId, entry_id: entryId, company_id: companyId, revision: 2, schema_version: "1.0.0",
  author_id: userId, change_reason: "Exact human correction.", created_at: time,
  review_status: "unreviewed", content: { ...fixture.company_foundation, overview: "NEW DRAFT ONLY" }, provenance,
};

function query(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
}
function session(member: boolean) {
  const tables = {
    company_members: query(member ? { role: "viewer" } : null),
    companies: query(company),
    knowledge_entries: query([{ id: entryId, kind: "company_foundation", company_id: companyId,
      current_revision: 2, created_by: userId, created_at: time }]),
    knowledge_entry_versions: query(revision),
    source_pages: query(fixture.provenance.sources.map((source) => ({
      ...source, company_id: companyId, scrape_job_id: userId, normalized_url: source.url,
      final_url: source.url, capture_status: "captured",
    })).map(({ url: _url, ...source }) => source)),
    knowledge_base_versions: query({ id: fixture.knowledge_base_version_id, version_number: fixture.version, payload: fixture }),
  };
  const client = { from: vi.fn((table: string) => tables[table as keyof typeof tables]), rpc: vi.fn() };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: userId } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return { client, tables };
}
function request(versionId: string, format = "docx") {
  return GET(new Request(`https://app.example/api/companies/${companyId}/document?versionId=${versionId}&format=${format}`), {
    params: Promise.resolve({ companyId }),
  });
}
beforeEach(() => vi.clearAllMocks());

it("requires a signed-in session and membership even for document reads", async () => {
  const { client, tables } = session(false);
  expect((await request(fixture.knowledge_base_version_id)).status).toBe(404);
  expect(client.from.mock.calls.map(([table]) => table)).toEqual(["company_members"]);
  expect(tables.company_members.eq).toHaveBeenCalledWith("company_id", companyId);
  expect(tables.company_members.eq).toHaveBeenCalledWith("user_id", userId);
  expect(client.rpc).not.toHaveBeenCalled();
  vi.mocked(verifiedSession).mockResolvedValue({ user: null, client } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  expect((await request("draft")).status).toBe(401);
});

it("exports a viewer's exact selected frozen snapshot without consulting current draft or recrawl data", async () => {
  const { client, tables } = session(true);
  const response = await request(fixture.knowledge_base_version_id);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="lumen-ledger-knowledge-base-v1.docx"');
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("vary")).toBe("Cookie");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const text = load(await zip.file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  expect(text).toContain(fixture.company_foundation.overview);
  expect(text).not.toContain("NEW DRAFT ONLY");
  expect(client.from.mock.calls.map(([table]) => table)).toEqual(["company_members", "knowledge_base_versions"]);
  expect(tables.knowledge_base_versions.eq).toHaveBeenCalledWith("company_id", companyId);
  expect(tables.knowledge_base_versions.eq).toHaveBeenCalledWith("id", fixture.knowledge_base_version_id);
  expect(client.rpc).not.toHaveBeenCalled();
});

it("exports full saved draft profile values, actual review states, coverage and source references without writes", async () => {
  const { client, tables } = session(true);
  const response = await request("draft");
  expect(response.status).toBe(200);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const text = load(await zip.file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  for (const value of ["NEW DRAFT ONLY", "Unreviewed", "Coverage & unknowns", fixture.provenance.sources[0].url, "Unknown"]) {
    expect(text).toContain(value);
  }
  expect(response.headers.get("content-disposition")).toContain("current-draft-company-knowledge-base-draft.docx");
  expect(tables.knowledge_entry_versions.eq).toHaveBeenCalledWith("company_id", companyId);
  expect(client.from).not.toHaveBeenCalledWith("knowledge_base_versions");
  expect(client.rpc).not.toHaveBeenCalled();
});

it("keeps saved JSON byte-identical to canonical download and draft JSON complete", async () => {
  session(true);
  const saved = await request(fixture.knowledge_base_version_id, "json");
  expect(saved.status).toBe(200);
  expect(await saved.text()).toBe(canonicalStringify(fixture));
  expect(saved.headers.get("content-type")).toBe("application/json; charset=utf-8");
  const draft = await request("draft", "json");
  expect(draft.status).toBe(200);
  const data = await draft.json();
  expect(data.company.name).toBe(company.name);
  expect(data.entries[0].content.overview).toBe("NEW DRAFT ONLY");
  expect(data.entries[0].review_status).toBe("unreviewed");
  expect(data.citationContext.evidence[0].excerpt).toBe(fixture.provenance.evidence[0].excerpt);
});

it("rejects invalid selectors and missing saved versions rather than falling back to another result", async () => {
  const { tables, client } = session(true);
  expect((await request("latest")).status).toBe(400);
  expect((await request("draft", "html")).status).toBe(400);
  expect(client.from).not.toHaveBeenCalled();
  tables.knowledge_base_versions.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await request(fixture.knowledge_base_version_id)).status).toBe(404);
  expect(client.from).not.toHaveBeenCalledWith("knowledge_entries");
});

it("returns a valid private PDF for the selected saved version", async () => {
  const { client } = session(true);
  const response = await request(fixture.knowledge_base_version_id, "pdf");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toContain("lumen-ledger-knowledge-base-v1.pdf");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBeGreaterThan(1);
  expect(client.from.mock.calls.map(([table]) => table)).toEqual(["company_members", "knowledge_base_versions"]);
});
