// Snapshots published before the site_links kind (migration 0017) are immutable and lack the section and its coverage row.
// Every read path must still load them; the stored bytes (and so payload_sha256 and the JSON downloads) stay untouched.
import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import legacy from "../contracts/legacy-illustrative-export.json";
import { canonicalHash, canonicalStringify } from "../../src/knowledge/canonical-json";
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
const stored = canonicalStringify(legacy);
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
    knowledge_base_versions: query({ id: versionId, company_id: companyId, version_number: legacy.version, payload: structuredClone(legacy) }),
  };
  const client = { from: vi.fn((table: string) => tables[table as keyof typeof tables]), rpc: vi.fn() };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: userId } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return client;
}
const params = { params: Promise.resolve({ companyId, versionId }) };
const documentRequest = (format: string) =>
  document(new Request(`https://app.example/api/companies/${companyId}/document?versionId=${versionId}&format=${format}`), { params: Promise.resolve({ companyId }) });
beforeEach(() => vi.clearAllMocks());

it("the fixture is the pre-0017 illustrative export: no site_links section, no site_links coverage", () => {
  expect("site_links" in legacy).toBe(false);
  expect(JSON.stringify(legacy.provenance.coverage)).not.toContain("/site_links");
});

it("readSnapshot upgrades a legacy payload for readers and keeps the stored payload as it was", async () => {
  const saved = await readSnapshot(session() as never, companyId, versionId, userId);
  expect(saved.payload.site_links).toEqual({ links: [] });
  expect(saved.payload.provenance.coverage.filter((item: { targets: string[] }) => item.targets.includes("/site_links/links"))).toEqual([
    { targets: ["/site_links/links"], status: "not_checked", job_id: null, reason: "No approved entry assessed this field." },
  ]);
  expect(saved.stored).toEqual(legacy);
  expect(canonicalStringify(saved.stored)).toBe(stored);
  expect(saved.payload.company_foundation).toEqual(legacy.company_foundation);
});

it("the version and download routes serve a legacy snapshot; the download is the stored bytes", async () => {
  session();
  const shown = await version(new Request("https://app.example/v"), params);
  expect(shown.status).toBe(200);
  expect((await shown.json()).data.site_links).toEqual({ links: [] });
  const file = await download(new Request("https://app.example/d"), params);
  expect(file.status).toBe(200);
  const body = await file.text();
  expect(body).toBe(stored);
  expect(await canonicalHash(JSON.parse(body))).toBe(await canonicalHash(legacy));
});

it("document export renders a legacy snapshot without a Site links section, and JSON/PDF keep the original data", async () => {
  session();
  const docx = await documentRequest("docx");
  expect(docx.status).toBe(200);
  const text = load(await (await JSZip.loadAsync(await docx.arrayBuffer())).file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  expect(text).toContain(legacy.company_foundation.overview);
  // No Site links section; the not-checked coverage row may still be listed under Coverage & unknowns.
  expect(text.split("Coverage & unknowns")[0]).not.toContain("Site links");
  const json = await documentRequest("json");
  expect(json.status).toBe(200);
  expect(await json.text()).toBe(stored);
  const response = await documentRequest("pdf");
  expect(response.status).toBe(200);
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const files = pdf.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
  const stream = files.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"));
  expect(Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("utf8")).toBe(stored);
});
