// Acceptance tests for Quest Q5 "model-fields", criterion C7: snapshots published before 0018 are immutable and lack the
// new fields and their coverage rows. Every read path still loads them (missing fields upgraded in memory to defaults),
// the stored bytes and the JSON downloads stay untouched, and that includes snapshots that were already at the old
// coverage maximum. Two generations of legacy snapshot exist: before 0017 (no site_links) and between 0017 and 0018
// (site_links present, no new fields); both must upgrade.
import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
// Private frozen copies of the pre-0017 and 0017-era exports (other suites' shared fixtures may be regenerated for the new fields).
import legacy from "../contracts/model-fields-legacy-pre0017-export.json";
import sitelinks from "../contracts/model-fields-legacy-0017-export.json";
import current from "../contracts/model-fields-export.json";
import { validateProvenance } from "../../src/contracts";
import { canonicalHash, canonicalStringify } from "../../src/knowledge/canonical-json";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { readSnapshot } from "../../src/server/snapshots";
import { GET as document } from "../../src/app/api/companies/[companyId]/document/route";
import { GET as version } from "../../src/app/api/companies/[companyId]/versions/[versionId]/route";
import { GET as download } from "../../src/app/api/companies/[companyId]/versions/[versionId]/download/route";

type Json = Record<string, any>;
const NOT_CHECKED = "not_checked";
function query(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
}
/** A session whose snapshot table holds `payload` (a private copy, as a database read returns). */
function session(payload: Json) {
  const tables = {
    company_members: query({ role: "viewer" }),
    knowledge_base_versions: query({ id: payload.knowledge_base_version_id, company_id: payload.company_id, version_number: payload.version, payload: structuredClone(payload) }),
  };
  const client = { from: vi.fn((table: string) => tables[table as keyof typeof tables]), rpc: vi.fn() };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: payload.provenance.company.snapshot_author_id } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return client;
}
/** readSnapshot, reporting a refusal to load as an assertion failure. */
async function read(payload: Json) {
  try {
    return await readSnapshot(session(payload) as never, payload.company_id, payload.knowledge_base_version_id, payload.provenance.company.snapshot_author_id);
  } catch (error) {
    return expect.fail(`readSnapshot must load this snapshot, but threw: ${(error as Error).message.slice(0, 300)}`);
  }
}
const params = (payload: Json) => ({ params: Promise.resolve({ companyId: payload.company_id, versionId: payload.knowledge_base_version_id }) });
const documentRequest = (payload: Json, format: string) =>
  document(new Request(`https://app.example/api/companies/${payload.company_id}/document?versionId=${payload.knowledge_base_version_id}&format=${format}`), { params: Promise.resolve({ companyId: payload.company_id }) });
beforeEach(() => vi.clearAllMocks());

/** Targets that exist only because of Q5, for the people and offerings of this payload (the snapshot assembly rule). */
function newTargets(payload: Json): string[] {
  return [
    "/company_foundation/revenue", "/online_presence/phone",
    ...payload.key_people.flatMap((item: Json) => ["age", "nationality", "portrait"].map((field) => `/key_people/@${item.id}/${field}`)),
    ...payload.offerings.map((item: Json) => `/offerings/@${item.id}/images`),
  ];
}
const rowsFor = (payload: Json, target: string): Json[] => payload.provenance.coverage.filter((row: Json) => row.targets.includes(target));
const businessOf = (payload: Json) => ({
  company_foundation: payload.company_foundation, positioning: payload.positioning, market_and_customers: payload.market_and_customers,
  branding_and_style: payload.branding_and_style, online_presence: payload.online_presence, site_links: payload.site_links,
  key_people: payload.key_people, offerings: payload.offerings,
});
const coverageIssues = (payload: Json) =>
  validateProvenance(businessOf(payload) as never, payload.provenance as never).filter((issue) => ["coverage_count", "coverage_unknown", "coverage_reason", "schema"].includes(issue.code));

/** The upgraded view: new fields at their defaults, every new target covered exactly once as not-checked. */
function expectUpgraded(saved: { payload: any }, original: Json, label: string) {
  const payload = saved.payload as Json;
  expect(payload.company_foundation, label).toHaveProperty("revenue", null);
  expect(payload.online_presence, label).toHaveProperty("phone", null);
  for (const [index, person] of (payload.key_people as Json[]).entries()) expect(person, `${label} person ${index}`).toMatchObject({ age: null, nationality: null, portrait: null });
  for (const [index, offering] of (payload.offerings as Json[]).entries()) expect(offering, `${label} offering ${index}`).toHaveProperty("images", []);
  // Everything that was stored is still there, unchanged.
  expect(payload.company_foundation.overview).toBe(original.company_foundation.overview);
  expect(payload.key_people.map((item: Json) => item.id)).toEqual(original.key_people.map((item: Json) => item.id));
  expect(payload.provenance.claims).toEqual(original.provenance.claims);
  for (const row of original.provenance.coverage) expect(payload.provenance.coverage, `${label}: stored coverage row kept`).toContainEqual(row);
  // Each new target is covered exactly once, honestly: nothing assessed it.
  for (const target of newTargets(payload)) {
    const rows = rowsFor(payload, target);
    expect(rows, `${label}: ${target}`).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: NOT_CHECKED, job_id: null });
    expect(typeof rows[0].reason === "string" && rows[0].reason.length > 0, `${label}: ${target} has a reason`).toBe(true);
  }
  expect(coverageIssues(payload), `${label}: coverage is exactly one assessment per required field`).toEqual([]);
}

describe("C7 [behavioural] a snapshot published before 0017 (no site_links, no new fields) still reads", () => {
  it("readSnapshot upgrades a copy: defaults for every new field and one not-checked coverage row per new target", async () => {
    const before = structuredClone(legacy);
    const saved = await read(legacy as Json);
    expectUpgraded(saved, legacy as Json, "pre-0017");
    expect(saved.payload.site_links).toEqual({ links: [] });
    expect(rowsFor(saved.payload as Json, "/site_links/links")).toHaveLength(1);
    expect(legacy, "the fixture object was not mutated").toEqual(before);
  });

  it("the stored payload is left exactly as it was (hash, bytes and object)", async () => {
    const stored = canonicalStringify(legacy);
    const saved = await read(legacy as Json);
    expect(saved.stored).toEqual(legacy);
    expect(canonicalStringify(saved.stored)).toBe(stored);
    expect(await canonicalHash(saved.stored)).toBe(await canonicalHash(legacy));
    expect(JSON.stringify(saved.stored)).not.toContain("revenue");
    expect(JSON.stringify(saved.stored)).not.toContain("portrait");
  });

  it("the version route shows the upgraded view and the download route serves the original bytes", async () => {
    const stored = canonicalStringify(legacy);
    session(legacy as Json);
    const shown = await version(new Request("https://app.example/v"), params(legacy as Json));
    expect(shown.status).toBe(200);
    const data = (await shown.json()).data;
    expect(data.company_foundation.revenue).toBeNull();
    expect(data.online_presence.phone).toBeNull();
    expect(data.key_people[0]).toMatchObject({ age: null, nationality: null, portrait: null });
    expect(data.offerings[0].images).toEqual([]);
    session(legacy as Json);
    const file = await download(new Request("https://app.example/d"), params(legacy as Json));
    expect(file.status).toBe(200);
    const body = await file.text();
    expect(body).toBe(stored);
    expect(body).not.toContain("revenue");
    expect(await canonicalHash(JSON.parse(body))).toBe(await canonicalHash(legacy));
  });

  it("document export renders it (DOCX without the new labels, JSON and PDF carry the original bytes)", async () => {
    const stored = canonicalStringify(legacy);
    session(legacy as Json);
    const docx = await documentRequest(legacy as Json, "docx");
    expect(docx.status).toBe(200);
    const text = load(await (await JSZip.loadAsync(await docx.arrayBuffer())).file("word/document.xml")!.async("string"), { xmlMode: true }).text();
    expect(text).toContain(legacy.company_foundation.overview);
    const body = text.split("Coverage & unknowns")[0];
    expect(body).toContain("Alex Chen");
    for (const label of ["Revenue: ", "Phone: ", "Age: ", "Nationality: "]) expect(body, label).not.toContain(label);
    session(legacy as Json);
    const json = await documentRequest(legacy as Json, "json");
    expect(json.status).toBe(200);
    expect(await json.text()).toBe(stored);
    session(legacy as Json);
    const response = await documentRequest(legacy as Json, "pdf");
    expect(response.status).toBe(200);
    const pdf = await PDFDocument.load(await response.arrayBuffer());
    const files = pdf.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
    const stream = files.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"));
    expect(Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("utf8")).toBe(stored);
  }, 30_000);
});

describe("C7 [behavioural] a snapshot published between 0017 and 0018 (site_links present, new fields missing) still reads", () => {
  it("is upgraded too: the presence of site_links must not hide the missing new fields", async () => {
    const before = structuredClone(sitelinks);
    const saved = await read(sitelinks as Json);
    expectUpgraded(saved, sitelinks as Json, "0017-era");
    expect(saved.payload.site_links).toEqual(sitelinks.site_links);
    expect(rowsFor(saved.payload as Json, "/site_links/links")).toHaveLength(1);
    expect(sitelinks).toEqual(before);
    expect(canonicalStringify(saved.stored)).toBe(canonicalStringify(sitelinks));
  });

  it("the version and download routes serve it, the download being the stored bytes", async () => {
    session(sitelinks as Json);
    const shown = await version(new Request("https://app.example/v"), params(sitelinks as Json));
    expect(shown.status).toBe(200);
    const data = (await shown.json()).data;
    expect(data.site_links.links).toHaveLength(2);
    expect(data.online_presence.phone).toBeNull();
    session(sitelinks as Json);
    const file = await download(new Request("https://app.example/d"), params(sitelinks as Json));
    expect(file.status).toBe(200);
    expect(await file.text()).toBe(canonicalStringify(sitelinks));
  });
});

describe("C7 [behavioural] a current snapshot is not upgraded twice", () => {
  it("reads unchanged: no extra coverage rows, no altered fields", async () => {
    const saved = await read(current as Json);
    expect(saved.payload).toEqual(current);
    expect((saved.payload as Json).provenance.coverage).toHaveLength(current.provenance.coverage.length);
    expect(coverageIssues(saved.payload as Json)).toEqual([]);
    expect(canonicalStringify(saved.stored)).toBe(canonicalStringify(current));
  });
});

/**
 * A legitimate legacy snapshot with `people` people and `offerings` offerings, built from the pre-0017 fixture: the
 * original five singleton sections and their stored claims, plus one claim per person/offering and one coverage row per
 * required target under the OLD registry (5 rows per person, 7 per offering, 29 singleton fields, 1 row for an empty collection).
 */
function legacyOf(people: number, offerings: number, withSiteLinks: boolean): Json {
  const data = structuredClone(legacy) as Json;
  const personFields = ["name", "title", "role", "gender", "background_or_relevance"];
  const offeringFields = ["name", "description", "offering_type", "category", "features", "pricing", "url"];
  const kept = data.provenance.entries.filter((entry: Json) => entry.kind !== "key_person" && entry.kind !== "offering");
  const keptIds = new Set(kept.map((entry: Json) => entry.entry_id));
  const author = data.provenance.company.snapshot_author_id;
  data.key_people = Array.from({ length: people }, (_, n) => ({ id: `b1000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, name: `Person ${n + 1}`, title: null, role: null, gender: null, background_or_relevance: null }));
  data.offerings = Array.from({ length: offerings }, (_, n) => ({
    id: `b2000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, name: `Offering ${n + 1}`, description: null, offering_type: null, category: null, features: [], pricing: null, url: null,
  }));
  const owned = [
    ...data.key_people.map((item: Json) => ({ kind: "key_person", item, root: `/key_people/@${item.id}`, fields: personFields })),
    ...data.offerings.map((item: Json) => ({ kind: "offering", item, root: `/offerings/@${item.id}`, fields: offeringFields })),
  ];
  data.provenance.entries = [
    ...kept,
    ...owned.map((entry) => ({ entry_id: entry.item.id, kind: entry.kind, revision: 1, review_status: "approved", author_id: author, saved_at: "2026-10-16T04:59:00Z" })),
  ];
  data.provenance.claims = [
    ...data.provenance.claims.filter((claim: Json) => keptIds.has(claim.entry_id)),
    ...owned.map((entry, n) => ({ id: `b3000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, entry_id: entry.item.id, targets: [`${entry.root}/name`], origin: "user_provided", evidence_ids: [], based_on_claim_ids: [], actor_id: author, authored_at: "2026-10-16T04:58:00Z", note: "Entered by hand." })),
  ];
  const singletons = (legacy.provenance.coverage as Json[]).flatMap((row) => row.targets.filter((target: string) => !target.startsWith("/key_people") && !target.startsWith("/offerings")).map((target: string) => ({ ...row, targets: [target] })));
  expect(singletons, "the pre-0017 fixture covers 29 singleton fields").toHaveLength(29);
  const row = (target: string) => ({ targets: [target], status: NOT_CHECKED, job_id: null, reason: "Entered manually; website extraction has not assessed this field." });
  data.provenance.coverage = [
    ...singletons,
    ...(people ? data.key_people.flatMap((item: Json) => personFields.map((field) => row(`/key_people/@${item.id}/${field}`))) : [row("/key_people")]),
    ...(offerings ? data.offerings.flatMap((item: Json) => offeringFields.map((field) => row(`/offerings/@${item.id}/${field}`))) : [row("/offerings")]),
  ];
  if (withSiteLinks) {
    data.site_links = { links: [] };
    data.provenance.coverage.push({ targets: ["/site_links/links"], status: NOT_CHECKED, job_id: null, reason: "No approved entry assessed this field." });
  }
  return data;
}

describe("C7 [behavioural] snapshots already at the old coverage maximum still read after the new rows are added", () => {
  it("fixtures are legitimate legacy snapshots of the old maximum (pre-0017: 1,000 rows; 0017-era: 1,001 rows)", () => {
    const old = legacyOf(194, 0, false);
    expect(old.provenance.coverage).toHaveLength(1000);
    expect("site_links" in old).toBe(false);
    const between = legacyOf(194, 0, true);
    expect(between.provenance.coverage).toHaveLength(1001);
    expect(between.site_links).toEqual({ links: [] });
  });

  it("pre-0017 maximum: 194 people, 1,000 stored rows -> reads, with 1,585 rows after the upgrade", async () => {
    const full = legacyOf(194, 0, false);
    const stored = canonicalStringify(full);
    const saved = await read(full);
    expect((saved.payload as Json).provenance.coverage).toHaveLength(1585);
    expectUpgraded(saved, full, "pre-0017 maximum");
    expect(canonicalStringify(saved.stored)).toBe(stored);
    expect(full.provenance.coverage).toHaveLength(1000);
  }, 60_000);

  it("0017-era maximum: 194 people, 1,001 stored rows -> reads, with 1,585 rows after the upgrade", async () => {
    const full = legacyOf(194, 0, true);
    const stored = canonicalStringify(full);
    const saved = await read(full);
    expect((saved.payload as Json).provenance.coverage).toHaveLength(1585);
    expectUpgraded(saved, full, "0017-era maximum");
    expect(canonicalStringify(saved.stored)).toBe(stored);
  }, 60_000);

  it("offering-heavy maximum: 138 offerings, no people (996 stored rows) -> 1,137 rows after the upgrade", async () => {
    const full = legacyOf(0, 138, false);
    expect(full.provenance.coverage).toHaveLength(996);
    const saved = await read(full);
    expect((saved.payload as Json).provenance.coverage).toHaveLength(996 + 1 + 2 + 138);
    expectUpgraded(saved, full, "offering-heavy");
  }, 60_000);

  it("Edge case: a legacy snapshot with no people and no offerings gains only the singleton rows", async () => {
    const empty = legacyOf(0, 0, false);
    const saved = await read(empty);
    expectUpgraded(saved, empty, "empty collections");
    expect((saved.payload as Json).provenance.coverage).toHaveLength(empty.provenance.coverage.length + 1 + 2);
  });

  it("the routes serve the maximum legacy snapshot: version 200, download is the original bytes, DOCX renders", async () => {
    const full = legacyOf(194, 0, false);
    const stored = canonicalStringify(full);
    session(full);
    expect((await version(new Request("https://app.example/v"), params(full))).status).toBe(200);
    session(full);
    const file = await download(new Request("https://app.example/d"), params(full));
    expect(file.status).toBe(200);
    expect(await file.text()).toBe(stored);
    session(full);
    const docx = await documentRequest(full, "docx");
    expect(docx.status).toBe(200);
    const text = load(await (await JSZip.loadAsync(await docx.arrayBuffer())).file("word/document.xml")!.async("string"), { xmlMode: true }).text();
    expect(text).toContain(legacy.company_foundation.overview);
    expect(text).toContain("Person 194");
  }, 60_000);
});
