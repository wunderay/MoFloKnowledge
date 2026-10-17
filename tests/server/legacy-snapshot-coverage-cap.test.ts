// A snapshot published before 0017 can already hold the maximum number of coverage rows (190 people x 5 fields,
// 3 offerings x 7, 29 singleton fields = 1,000). Upgrading adds rows (site_links, then the model fields), so the read path must still accept it.
import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import legacy from "../contracts/legacy-illustrative-export.json";
import { canonicalStringify } from "../../src/knowledge/canonical-json";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { readSnapshot } from "../../src/server/snapshots";
import { GET as document } from "../../src/app/api/companies/[companyId]/document/route";
import { GET as version } from "../../src/app/api/companies/[companyId]/versions/[versionId]/route";
import { GET as download } from "../../src/app/api/companies/[companyId]/versions/[versionId]/download/route";

const companyId = legacy.company_id;
const userId = legacy.provenance.company.snapshot_author_id;
const versionId = legacy.knowledge_base_version_id;
const full = structuredClone(legacy);
const padding = 1000 - full.provenance.coverage.length;
for (let index = 0; index < padding; index++)
  full.provenance.coverage.push({
    targets: [`/key_people/@a5000000-0000-4000-8000-${String(index).padStart(12, "0")}/name`],
    status: "not_checked", job_id: null, reason: "Entered manually; website extraction has not assessed this field.",
  } as never);
const stored = canonicalStringify(full);
function query(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
}
function session() {
  const tables = {
    company_members: query({ role: "viewer" }),
    knowledge_base_versions: query({ id: versionId, company_id: companyId, version_number: full.version, payload: structuredClone(full) }),
  };
  const client = { from: vi.fn((table: string) => tables[table as keyof typeof tables]), rpc: vi.fn() };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: userId } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return client;
}
const params = { params: Promise.resolve({ companyId, versionId }) };
beforeEach(() => vi.clearAllMocks());

it("the fixture is a legacy snapshot with exactly 1,000 coverage rows", () => {
  expect(full.provenance.coverage).toHaveLength(1000);
  expect("site_links" in full).toBe(false);
});

it("reads it, serves the original bytes for download, and renders the document", async () => {
  const saved = await readSnapshot(session() as never, companyId, versionId, userId);
  expect(saved.payload.site_links).toEqual({ links: [] });
  // The upgrade adds 7 rows: site_links, revenue, phone, the person's age, nationality and portrait, the offering's images.
  expect(saved.payload.provenance.coverage).toHaveLength(1007);
  expect(canonicalStringify(saved.stored)).toBe(stored);
  expect((await version(new Request("https://app.example/v"), params)).status).toBe(200);
  const file = await download(new Request("https://app.example/d"), params);
  expect(file.status).toBe(200);
  expect(await file.text()).toBe(stored);
  const docx = await document(new Request(`https://app.example/api/companies/${companyId}/document?versionId=${versionId}&format=docx`), { params: Promise.resolve({ companyId }) });
  expect(docx.status).toBe(200);
  const text = load(await (await JSZip.loadAsync(await docx.arrayBuffer())).file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  expect(text).toContain(legacy.company_foundation.overview);
});
