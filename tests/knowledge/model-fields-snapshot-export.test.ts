// Snapshots, provenance/coverage and the document export
// (and the snapshot half of the field validation).
// Uses its own fixture (tests/contracts/model-fields-export.json) so it does not depend on the shared illustrative export.
//
// Notes:
//  - Document export: the business body shows "Revenue", "Phone" (formatted "(555) 010-0199"), "Age" and "Nationality"
//     when populated and omits them when null. Image references (portrait, offering images) are not rendered: no image
//     binary is embedded in DOCX or PDF, and no storage path, object id, content type or byte size appears in the document
//     (internal storage identifiers are not for readers). Mentioning only a count, or nothing, are both fine.
//  - The company segment of every storage path equals the snapshot's company_id.
//  - Pre-0018 entry revisions saved without the new keys still assemble into a snapshot (defaults are filled in).
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import { ZodError } from "zod";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import fixture from "../contracts/model-fields-export.json";
import {
  BusinessSchema,
  EntryProvenanceSchema,
  KnowledgeBaseExportSchema,
  validateProvenance,
  type BusinessEntry,
} from "../../src/contracts";
import { assembleKnowledgeBase, type SnapshotEntry } from "../../src/knowledge/assemble";
import { documentParagraphs, renderKnowledgeDocument } from "../../src/knowledge/document-export";
import { renderKnowledgePdf } from "../../src/knowledge/pdf-export";

type Json = Record<string, any>;
const clone = (): Json => structuredClone(fixture) as Json;
const PERSON = "30000000-0000-4000-8000-000000000006";
const OFFERING = "30000000-0000-4000-8000-000000000007";
const COMPANY = fixture.company_id;
const OTHER_COMPANY = "10000000-0000-4000-8000-0000000000ff";
const PORTRAIT = fixture.key_people[0].portrait;
const IMAGES = fixture.offerings[0].images;
const businessOf = (snapshot: Json) => ({
  company_foundation: snapshot.company_foundation,
  positioning: snapshot.positioning,
  market_and_customers: snapshot.market_and_customers,
  branding_and_style: snapshot.branding_and_style,
  online_presence: snapshot.online_presence,
  site_links: snapshot.site_links,
  key_people: snapshot.key_people,
  offerings: snapshot.offerings,
});
const exportOk = (snapshot: unknown) => KnowledgeBaseExportSchema.safeParse(snapshot).success;
const issuesOf = (snapshot: Json) => validateProvenance(businessOf(snapshot) as never, snapshot.provenance as never);
/** Rejection counts only against the unmodified control. */
function exportRejectsOnlyBecauseOf(variant: Json, label: string) {
  expect(exportOk(fixture), "valid control must be accepted").toBe(true);
  expect(exportOk(variant), `${label} must be rejected`).toBe(false);
}
const nullNewFields = (snapshot: Json): Json => {
  snapshot.company_foundation.revenue = null;
  snapshot.online_presence.phone = null;
  Object.assign(snapshot.key_people[0], { age: null, nationality: null, portrait: null });
  snapshot.offerings[0].images = [];
  const newTarget = (target: string) =>
    /\/(?:revenue|phone)$/.test(target) || /\/(?:age|nationality)$/.test(target) || /\/(?:portrait|images)(?:\/|$)/.test(target);
  for (const claim of snapshot.provenance.claims) {
    claim.targets = claim.targets.filter((target: string) => !newTarget(target));
  }
  snapshot.provenance.claims = snapshot.provenance.claims.filter((claim: Json) => claim.targets.length > 0);
  return snapshot;
};

const NEW_TARGETS = [
  "/company_foundation/revenue",
  "/online_presence/phone",
  `/key_people/@${PERSON}/age`,
  `/key_people/@${PERSON}/nationality`,
  `/key_people/@${PERSON}/portrait`,
  `/offerings/@${OFFERING}/images`,
];

describe("snapshots carry the new fields and validate", () => {
  it("KnowledgeBaseExportSchema accepts a snapshot with every new field populated, and BusinessSchema its sections", () => {
    const parsed = KnowledgeBaseExportSchema.safeParse(fixture);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
    expect(BusinessSchema.safeParse(businessOf(clone())).success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.company_foundation).toHaveProperty("revenue", "€2.3M (FY2025)");
      expect(parsed.data.online_presence).toHaveProperty("phone", "5550100199");
      expect(parsed.data.key_people[0]).toMatchObject({ age: 42, nationality: "Canadian", portrait: PORTRAIT });
      expect(parsed.data.offerings[0]).toHaveProperty("images", IMAGES);
    }
  });

  it("the same snapshot with every new field empty (null / []) is valid too", () => {
    expect(exportOk(fixture), "valid control").toBe(true);
    expect(exportOk(nullNewFields(clone()))).toBe(true);
  });

  it("complete user-provided claims plus coverage for all six new fields validate with no issues", () => {
    expect(issuesOf(clone())).toEqual([]);
  });

  it("every populated leaf of the new fields needs a claim (age, nationality, portrait parts, image parts, revenue, phone)", () => {
    expect(issuesOf(clone()), "valid control").toEqual([]);
    const leaves = [
      "/company_foundation/revenue", "/online_presence/phone", `/key_people/@${PERSON}/age`, `/key_people/@${PERSON}/nationality`,
      `/key_people/@${PERSON}/portrait/path`, `/key_people/@${PERSON}/portrait/content_type`, `/key_people/@${PERSON}/portrait/size_bytes`,
      `/offerings/@${OFFERING}/images/@${IMAGES[0].id}/path`, `/offerings/@${OFFERING}/images/@${IMAGES[1].id}/size_bytes`,
    ];
    for (const leaf of leaves) {
      const snapshot = clone();
      for (const claim of snapshot.provenance.claims) {
        claim.targets = claim.targets.filter((target: string) => target !== leaf);
      }
      snapshot.provenance.claims = snapshot.provenance.claims.filter((claim: Json) => claim.targets.length > 0);
      const issues = issuesOf(snapshot);
      expect(issues.some((issue) => issue.code === "leaf_unclaimed" && issue.path === leaf), `${leaf} unclaimed`).toBe(true);
    }
  });

  it("Edge case: an empty / null new field needs coverage but no claim", () => {
    const snapshot = nullNewFields(clone());
    snapshot.provenance.coverage = snapshot.provenance.coverage.filter((row: Json) => !(row.targets.length === 6 && row.reason?.startsWith("Entered manually by a reviewer")));
    snapshot.provenance.coverage.push({ targets: NEW_TARGETS, status: "not_found", job_id: null, reason: "Nothing recorded for these fields." });
    expect(issuesOf(snapshot)).toEqual([]);
    const missing = clone();
    nullNewFields(missing);
    missing.provenance.coverage = missing.provenance.coverage.map((row: Json) => ({ ...row, targets: row.targets.filter((target: string) => !NEW_TARGETS.includes(target)) })).filter((row: Json) => row.targets.length);
    for (const target of NEW_TARGETS) {
      expect(issuesOf(missing).some((issue) => issue.code === "coverage_count" && issue.path === target), `${target} needs coverage even when empty`).toBe(true);
    }
  });

  it("Edge case: each new target needs exactly one coverage assessment (missing and duplicated are reported)", () => {
    expect(issuesOf(clone()), "valid control").toEqual([]);
    for (const target of NEW_TARGETS) {
      const missing = clone();
      missing.provenance.coverage = missing.provenance.coverage.map((row: Json) => ({ ...row, targets: row.targets.filter((item: string) => item !== target) })).filter((row: Json) => row.targets.length);
      expect(issuesOf(missing).some((issue) => issue.code === "coverage_count" && issue.path === target), `missing ${target}`).toBe(true);
      const duplicated = clone();
      duplicated.provenance.coverage.push({ targets: [target], status: "not_checked", job_id: null, reason: "Again." });
      expect(issuesOf(duplicated).some((issue) => issue.code === "coverage_count" && issue.path === target), `duplicate ${target}`).toBe(true);
    }
  });

  it("Edge case: a claim on a new field must belong to the entry that owns it (another person's age is refused)", () => {
    expect(issuesOf(clone()), "valid control").toEqual([]);
    const snapshot = clone();
    const claim = snapshot.provenance.claims.find((item: Json) => item.id === "70000000-0000-4000-8000-0000000000b3");
    claim.entry_id = "30000000-0000-4000-8000-000000000001";
    expect(issuesOf(snapshot).map((issue) => issue.code)).toContain("entry_target");
  });

  it("Edge case: claims on new fields that point at values which are not there are reported", () => {
    expect(issuesOf(clone()), "valid control").toEqual([]);
    const snapshot = clone();
    snapshot.provenance.claims[0].targets.push(`/key_people/@${PERSON}/photo`);
    expect(issuesOf(snapshot).map((issue) => issue.code)).toContain("target_missing");
    const dropped = nullNewFields(clone());
    dropped.provenance.claims.push({ ...clone().provenance.claims.find((item: Json) => item.id === "70000000-0000-4000-8000-0000000000b3") });
    expect(issuesOf(dropped).map((issue) => issue.code)).toContain("target_missing");
  });
});

describe("the export schema enforces the new rules", () => {
  it("Edge case: invalid age, nationality, revenue and phone make the export invalid", () => {
    const mutate = (change: (snapshot: Json) => void) => { const snapshot = clone(); change(snapshot); return snapshot; };
    for (const age of [-1, 151, 2.5, "42", Number.NaN]) {
      exportRejectsOnlyBecauseOf(mutate((s) => { s.key_people[0].age = age; }), `age ${age}`);
    }
    for (const nationality of ["", "  "]) {
      exportRejectsOnlyBecauseOf(mutate((s) => { s.key_people[0].nationality = nationality; }), `nationality ${JSON.stringify(nationality)}`);
    }
    for (const revenue of ["", "   ", 5]) {
      exportRejectsOnlyBecauseOf(mutate((s) => { s.company_foundation.revenue = revenue; }), `revenue ${JSON.stringify(revenue)}`);
    }
    for (const phone of ["555010019", "55501001999", "+15550100199", "555-010-FLOW", "", 5550100199]) {
      exportRejectsOnlyBecauseOf(mutate((s) => { s.online_presence.phone = phone; }), `phone ${JSON.stringify(phone)}`);
    }
    expect(exportOk(mutate((s) => { s.key_people[0].age = 0; })), "age 0 is valid").toBe(true);
    expect(exportOk(mutate((s) => { s.key_people[0].age = 150; })), "age 150 is valid").toBe(true);
  });

  it("Edge case: invalid storage references make the export invalid (traversal, extension, content type, size, 21 images)", () => {
    const mutate = (change: (snapshot: Json) => void) => { const snapshot = clone(); change(snapshot); return snapshot; };
    const segment = `${COMPANY}/${PORTRAIT.id}`;
    for (const bad of [`portraits/${COMPANY}/../${PORTRAIT.id}.png`, `/portraits/${segment}.png`, `avatars/${segment}.png`, `portraits/${segment}.exe`, `portraits/${segment}.PNG`, `portraits/acme/${PORTRAIT.id}.png`]) {
      exportRejectsOnlyBecauseOf(mutate((s) => { s.key_people[0].portrait.path = bad; }), bad);
    }
    exportRejectsOnlyBecauseOf(mutate((s) => { s.key_people[0].portrait.content_type = "image/jpeg"; }), "png path with jpeg content type");
    exportRejectsOnlyBecauseOf(mutate((s) => { s.key_people[0].portrait.content_type = "image/bmp"; }), "bmp");
    for (const size of [0, -1, 1.5, 5242881]) {
      exportRejectsOnlyBecauseOf(mutate((s) => { s.key_people[0].portrait.size_bytes = size; }), `size ${size}`);
    }
    exportRejectsOnlyBecauseOf(mutate((s) => { s.offerings[0].images[0].path = `offering-images/${COMPANY}/../x.jpg`; }), "image traversal");
    exportRejectsOnlyBecauseOf(mutate((s) => { s.offerings[0].images[0].alt = "x"; }), "unknown key on image");
    exportRejectsOnlyBecauseOf(mutate((s) => {
      s.offerings[0].images = Array.from({ length: 21 }, (_, index) => {
        const id = `91000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
        return { id, path: `offering-images/${COMPANY}/${id}.png`, content_type: "image/png", size_bytes: 10 };
      });
    }), "21 images");
  });

  it("Edge case: a storage path under another company's folder is refused in the export", () => {
    expect(exportOk(fixture), "valid control").toBe(true);
    expect(COMPANY).not.toBe(OTHER_COMPANY);
    const portrait = clone();
    portrait.key_people[0].portrait.path = `portraits/${OTHER_COMPANY}/${PORTRAIT.id}.png`;
    expect(exportOk(portrait), "portrait of another company").toBe(false);
    const image = clone();
    image.offerings[0].images[1].path = `offering-images/${OTHER_COMPANY}/${IMAGES[1].id}.webp`;
    expect(exportOk(image), "offering image of another company").toBe(false);
  });

  it("Edge case: image and portrait ids may not collide with any other business id", () => {
    expect(exportOk(fixture), "valid control").toBe(true);
    const withPerson = clone();
    withPerson.key_people[0].portrait.id = PERSON;
    expect(exportOk(withPerson), "portrait id = person id").toBe(false);
    const withImage = clone();
    withImage.key_people[0].portrait.id = IMAGES[0].id;
    expect(exportOk(withImage), "portrait id = image id").toBe(false);
    const withOffering = clone();
    withOffering.offerings[0].images[0].id = OFFERING;
    expect(exportOk(withOffering), "image id = offering id").toBe(false);
    const duplicate = clone();
    duplicate.offerings[0].images[1].id = IMAGES[0].id;
    expect(exportOk(duplicate), "duplicate image ids").toBe(false);
  });
});

/** Same projection the repo's knowledge tests use: one SnapshotEntry per provenance manifest row. */
function entries(): SnapshotEntry[] {
  const data = clone();
  const p = data.provenance;
  return p.entries.map((entry: Json, index: number) => {
    const content =
      entry.kind === "key_person" ? data.key_people[0]
      : entry.kind === "offering" ? data.offerings[0]
      : data[entry.kind];
    const root =
      entry.kind === "key_person" ? `/key_people/@${entry.entry_id}`
      : entry.kind === "offering" ? `/offerings/@${entry.entry_id}`
      : `/${entry.kind}`;
    return {
      ...entry,
      review_status: "approved",
      created_at: `2026-10-16T04:0${index}:00Z`,
      content: structuredClone(content) as BusinessEntry,
      provenance: EntryProvenanceSchema.parse({
        sources: p.sources,
        evidence: p.evidence,
        claims: p.claims.filter((c: Json) => c.entry_id === entry.entry_id),
        coverage: p.coverage.flatMap((c: Json) => {
          const targets = c.targets.filter((t: string) => t === root || t.startsWith(`${root}/`));
          return targets.length ? [{ ...c, targets }] : [];
        }),
        operations: p.operations.filter((o: Json) => o.entry_id === entry.entry_id),
      }),
    } as SnapshotEntry;
  });
}
const assemble = (rows: SnapshotEntry[]) =>
  assembleKnowledgeBase({
    company: { id: COMPANY, name: "Lumen Ledger", website: "https://lumen-ledger.example/" },
    snapshotId: fixture.knowledge_base_version_id,
    version: 1,
    savedAt: "2026-10-16T04:59:00Z",
    authorId: fixture.provenance.company.snapshot_author_id,
    entries: rows,
  });
function assembleOk(rows: SnapshotEntry[]) {
  let snapshot: ReturnType<typeof assemble> | undefined;
  expect(() => { snapshot = assemble(rows); }, "assembling approved entries must succeed").not.toThrow();
  return snapshot!;
}
const entryOf = (rows: SnapshotEntry[], kind: string) => rows.find((row) => row.kind === kind)!;
const coverageFor = (snapshot: Json, target: string) => snapshot.provenance.coverage.filter((row: Json) => row.targets.includes(target));

describe("snapshot assembly treats the new fields like any other approved field", () => {
  it("includes the new fields, their claims and exactly one coverage row per new target", () => {
    const snapshot = assembleOk(entries()) as unknown as Json;
    expect(snapshot.company_foundation.revenue).toBe("€2.3M (FY2025)");
    expect(snapshot.online_presence.phone).toBe("5550100199");
    expect(snapshot.key_people[0]).toMatchObject({ age: 42, nationality: "Canadian", portrait: PORTRAIT });
    expect(snapshot.offerings[0].images).toEqual(IMAGES);
    for (const target of NEW_TARGETS) {
      const rows = coverageFor(snapshot, target);
      expect(rows, target).toHaveLength(1);
      expect(rows[0].targets).toEqual([target]);
      expect(rows[0].status).toBe("found");
    }
    const claimed = snapshot.provenance.claims.flatMap((claim: Json) => claim.targets);
    for (const leaf of [`/key_people/@${PERSON}/age`, `/key_people/@${PERSON}/portrait/path`, `/offerings/@${OFFERING}/images/@${IMAGES[0].id}/content_type`, "/company_foundation/revenue", "/online_presence/phone"]) {
      expect(claimed, leaf).toContain(leaf);
    }
    expect(KnowledgeBaseExportSchema.safeParse(snapshot).success).toBe(true);
    expect(issuesOf(snapshot)).toEqual([]);
  });

  it("entries that leave the new fields empty produce not-checked coverage rows for them", () => {
    const rows = entries();
    for (const row of rows) {
      const content = row.content as unknown as Json;
      if (row.kind === "company_foundation") {
        content.revenue = null;
      }
      if (row.kind === "online_presence") {
        content.phone = null;
      }
      if (row.kind === "key_person") {
        Object.assign(content, { age: null, nationality: null, portrait: null });
      }
      if (row.kind === "offering") {
        content.images = [];
      }
      row.provenance.claims = row.provenance.claims
        .map((claim) => ({ ...claim, targets: claim.targets.filter((target) => !NEW_TARGETS.some((n) => target === n || target.startsWith(`${n}/`))) }))
        .filter((claim) => claim.targets.length > 0);
      row.provenance.coverage = row.provenance.coverage
        .map((item) => ({ ...item, targets: item.targets.filter((target) => !NEW_TARGETS.includes(target)) }))
        .filter((item) => item.targets.length > 0);
    }
    const snapshot = assembleOk(rows) as unknown as Json;
    expect(snapshot.company_foundation.revenue).toBeNull();
    expect(snapshot.key_people[0]).toMatchObject({ age: null, nationality: null, portrait: null });
    expect(snapshot.offerings[0].images).toEqual([]);
    for (const target of NEW_TARGETS) {
      expect(coverageFor(snapshot, target), target).toEqual([{ targets: [target], status: "not_checked", job_id: null, reason: "No approved entry assessed this field." }]);
    }
  });

  it("Edge case: an approved entry holding an invalid new value is refused when assembling", () => {
    const attempts: [string, (rows: SnapshotEntry[]) => void][] = [
      ["age 151", (rows) => { (entryOf(rows, "key_person").content as unknown as Json).age = 151; }],
      ["phone with 9 digits", (rows) => { (entryOf(rows, "online_presence").content as unknown as Json).phone = "555010019"; }],
      ["blank revenue", (rows) => { (entryOf(rows, "company_foundation").content as unknown as Json).revenue = "  "; }],
      ["portrait path traversal", (rows) => { ((entryOf(rows, "key_person").content as unknown as Json).portrait as Json).path = "../etc/passwd"; }],
      ["21 images", (rows) => {
        (entryOf(rows, "offering").content as unknown as Json).images = Array.from({ length: 21 }, (_, index) => {
          const id = `91000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
          return { id, path: `offering-images/${COMPANY}/${id}.png`, content_type: "image/png", size_bytes: 10 };
        });
      }],
    ];
    assembleOk(entries());
    for (const [label, change] of attempts) {
      const rows = entries();
      change(rows);
      expect(() => assemble(rows), label).toThrow(ZodError);
    }
  });

  it("Edge case: entry revisions saved before 0018 (no new keys) still assemble with defaults", () => {
    const rows = entries();
    for (const row of rows) {
      const content = row.content as unknown as Json;
      delete content.revenue;
      delete content.phone;
      delete content.age;
      delete content.nationality;
      delete content.portrait;
      delete content.images;
      row.provenance.claims = row.provenance.claims
        .map((claim) => ({ ...claim, targets: claim.targets.filter((target) => !NEW_TARGETS.some((n) => target === n || target.startsWith(`${n}/`))) }))
        .filter((claim) => claim.targets.length > 0);
      row.provenance.coverage = row.provenance.coverage
        .map((item) => ({ ...item, targets: item.targets.filter((target) => !NEW_TARGETS.includes(target)) }))
        .filter((item) => item.targets.length > 0);
    }
    const snapshot = assembleOk(rows) as unknown as Json;
    expect(snapshot.company_foundation.revenue).toBeNull();
    expect(snapshot.online_presence.phone).toBeNull();
    expect(snapshot.key_people[0]).toMatchObject({ age: null, nationality: null, portrait: null });
    expect(snapshot.offerings[0].images).toEqual([]);
    for (const target of NEW_TARGETS) {
      expect(coverageFor(snapshot, target), target).toHaveLength(1);
    }
    expect(KnowledgeBaseExportSchema.safeParse(snapshot).success).toBe(true);
  });

  it("history: a snapshot is a frozen copy; a later revision of the new fields only affects later snapshots", () => {
    const rows = entries();
    const first = assembleOk(rows);
    const frozen = structuredClone(first);
    const person = entryOf(rows, "key_person");
    (person.content as unknown as Json).age = 43;
    person.revision += 1;
    const second = assembleOk(rows) as unknown as Json;
    expect(first).toEqual(frozen);
    expect((first as unknown as Json).key_people[0].age).toBe(42);
    expect(second.key_people[0].age).toBe(43);
  });
});

/** The business body: everything before the "Coverage & unknowns" section. */
const lineOf = (paragraph: { label?: string; text: string }) => (paragraph.label ? `${paragraph.label}: ${paragraph.text}` : paragraph.text);
function body(snapshot: unknown) {
  const paragraphs = documentParagraphs({ kind: "snapshot", snapshot: snapshot as never });
  const end = paragraphs.findIndex((item) => item.heading === "section" && item.text === "Coverage & unknowns");
  expect(end, "document has a Coverage & unknowns section").toBeGreaterThan(0);
  return paragraphs.slice(0, end);
}
function section(snapshot: unknown, title: string): string[] | null {
  const paragraphs = body(snapshot);
  const start = paragraphs.findIndex((item) => item.heading === "section" && item.text === title);
  if (start < 0) {
    return null;
  }
  const rest = paragraphs.slice(start + 1);
  const end = rest.findIndex((item) => item.heading === "section");
  return (end < 0 ? rest : rest.slice(0, end)).map(lineOf);
}
const withValues = (change: (snapshot: Json) => void) => { const snapshot = clone(); change(snapshot); return snapshot; };
const docxXml = async (snapshot: unknown) => {
  const zip = await JSZip.loadAsync(await renderKnowledgeDocument({ kind: "snapshot", snapshot: snapshot as never }));
  return { zip, xml: await zip.file("word/document.xml")!.async("string") };
};

describe("document export shows Revenue, Phone (formatted), Age and Nationality when present", () => {
  it("shows Revenue under Company details, exactly as written", () => {
    const lines = section(fixture, "Company details");
    expect(lines, "a 'Company details' section").not.toBeNull();
    expect(lines).toContain("Revenue: €2.3M (FY2025)");
  });

  it("shows Phone under Online presence in the formatted (555) 010-0199 form, never as bare digits", () => {
    const lines = section(fixture, "Online presence");
    expect(lines, "an 'Online presence' section").not.toBeNull();
    expect(lines).toContain("Phone: (555) 010-0199");
    const everything = documentParagraphs({ kind: "snapshot", snapshot: fixture as never }).map(lineOf).join("\n");
    expect(everything).not.toContain("5550100199");
  });

  it("formats any 10 digits as (AAA) BBB-CCCC, leading zeros included", () => {
    expect(section(withValues((s) => { s.online_presence.phone = "2125550123"; }), "Online presence")).toContain("Phone: (212) 555-0123");
    expect(section(withValues((s) => { s.online_presence.phone = "0000000000"; }), "Online presence")).toContain("Phone: (000) 000-0000");
    expect(section(withValues((s) => { s.online_presence.phone = "9876543210"; }), "Online presence")).toContain("Phone: (987) 654-3210");
  });

  it("shows Age and Nationality inside the Key people section, after the person's name", () => {
    const lines = section(fixture, "Key people");
    expect(lines, "a 'Key people' section").not.toBeNull();
    expect(lines).toContain("Age: 42");
    expect(lines).toContain("Nationality: Canadian");
    const name = lines!.indexOf("Alex Chen");
    expect(name).toBeGreaterThanOrEqual(0);
    expect(lines!.indexOf("Age: 42")).toBeGreaterThan(name);
    expect(lines!.indexOf("Nationality: Canadian")).toBeGreaterThan(name);
  });

  it("Edge case: age 0 and age 150 are shown (0 is a value, not 'absent')", () => {
    expect(section(withValues((s) => { s.key_people[0].age = 0; }), "Key people")).toContain("Age: 0");
    expect(section(withValues((s) => { s.key_people[0].age = 150; }), "Key people")).toContain("Age: 150");
  });

  it("the OOXML document contains the four values with the formatted phone", async () => {
    const { xml } = await docxXml(fixture);
    const text = load(xml, { xmlMode: true }).text();
    expect(text).toContain("Revenue: €2.3M (FY2025)");
    expect(text).toContain("Phone: (555) 010-0199");
    expect(text).toContain("Age: 42");
    expect(text).toContain("Nationality: Canadian");
    expect(text).not.toContain("5550100199");
  });

  it("Edge case: markup in revenue or nationality is escaped in the OOXML document", async () => {
    const snapshot = withValues((s) => {
      s.company_foundation.revenue = '<script>alert("x")</script> & $1M "ARR"';
      s.key_people[0].nationality = "<b>Dutch</b>";
    });
    const { xml } = await docxXml(snapshot);
    const text = load(xml, { xmlMode: true }).text();
    expect(text).toContain('<script>alert("x")</script> & $1M "ARR"');
    expect(text).toContain("<b>Dutch</b>");
    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("<b>Dutch</b>");
    expect(xml).toContain("&lt;script&gt;");
  });
});

describe("document export omits empty new fields", () => {
  const labelPattern: Record<string, RegExp> = { revenue: /^Revenue: /, phone: /^Phone: /, age: /^Age: /, nationality: /^Nationality: / };
  const businessLines = (snapshot: unknown) => body(snapshot).map(lineOf);

  it("a snapshot whose new fields are all null shows none of the four labels in the business body", () => {
    const populated = businessLines(fixture);
    for (const pattern of Object.values(labelPattern)) {
      expect(populated.some((line) => pattern.test(line)), `control shows ${pattern}`).toBe(true);
    }
    const empty = businessLines(nullNewFields(clone()));
    for (const [field, pattern] of Object.entries(labelPattern)) {
      expect(empty.some((line) => pattern.test(line)), `${field} omitted when null`).toBe(false);
    }
  });

  it("each field is omitted on its own while the others stay", () => {
    const changes: Record<string, (s: Json) => void> = {
      revenue: (s) => { s.company_foundation.revenue = null; },
      phone: (s) => { s.online_presence.phone = null; },
      age: (s) => { s.key_people[0].age = null; },
      nationality: (s) => { s.key_people[0].nationality = null; },
    };
    for (const [field, change] of Object.entries(changes)) {
      const lines = businessLines(withValues(change));
      for (const [other, pattern] of Object.entries(labelPattern)) {
        expect(lines.some((line) => pattern.test(line)), `${field} null -> ${other}`).toBe(other !== field);
      }
    }
  });

  it("the OOXML document omits the labels when the fields are null", async () => {
    const { xml } = await docxXml(nullNewFields(clone()));
    const text = load(xml, { xmlMode: true }).text().split("Coverage & unknowns")[0];
    expect(text).toContain("Alex Chen");
    for (const label of ["Revenue: ", "Phone: ", "Age: ", "Nationality: "]) {
      expect(text, label).not.toContain(label);
    }
  });
});

describe("document export does not embed image binaries or list storage paths", () => {
  const imageStrings = [PORTRAIT.path, ...IMAGES.map((item) => item.path), PORTRAIT.id, ...IMAGES.map((item) => item.id), "offering-images/", "portraits/", "image/webp", "image/jpeg", String(PORTRAIT.size_bytes)];

  it("the document projection lists no storage path, id, content type or size", () => {
    expect(documentParagraphs({ kind: "snapshot", snapshot: fixture as never }).length).toBeGreaterThan(10);
    const text = documentParagraphs({ kind: "snapshot", snapshot: fixture as never }).map(lineOf).join("\n");
    expect(text, "the same document still shows the person").toContain("Age: 42");
    for (const needle of imageStrings) {
      expect(text, needle).not.toContain(needle);
    }
  });

  it("the OOXML package has no media parts, drawings or image relationships and no storage path in its text", async () => {
    const { zip, xml } = await docxXml(fixture);
    expect(load(xml, { xmlMode: true }).text(), "the same document still shows the person's age").toContain("Age: 42");
    expect(Object.keys(zip.files).filter((name) => name.startsWith("word/media/") || /\.(?:png|jpe?g|gif|webp|svg)$/i.test(name))).toEqual([]);
    expect(xml).not.toContain("<w:drawing");
    expect(xml).not.toContain("<pic:pic");
    expect(xml).not.toContain("<w:pict");
    const relationships = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(relationships).not.toMatch(/relationships\/image/);
    const text = load(xml, { xmlMode: true }).text();
    for (const needle of imageStrings) {
      expect(text, needle).not.toContain(needle);
    }
  });

  it("the PDF has no image XObjects (its only attachment is the original JSON)", async () => {
    const bytes = await renderKnowledgePdf({ kind: "snapshot", snapshot: fixture as never });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    const images = pdf.context.enumerateIndirectObjects().filter(([, object]) => {
      const dict = object instanceof PDFRawStream ? object.dict : object instanceof PDFDict ? object : undefined;
      return dict?.get(PDFName.of("Subtype")) === PDFName.of("Image");
    });
    expect(images).toHaveLength(0);
  });
});
