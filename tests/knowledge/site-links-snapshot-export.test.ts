// Snapshots, provenance/coverage and document export.
// Uses its own fixture (tests/contracts/site-links-export.json) so it does not depend on the shared illustrative export.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import { ZodError } from "zod";
import fixture from "../contracts/site-links-export.json";
import {
  BusinessSchema,
  EntryProvenanceSchema,
  KnowledgeBaseExportSchema,
  validateProvenance,
  type BusinessEntry,
} from "../../src/contracts";
import {
  assembleKnowledgeBase,
  previewPublication,
  type SnapshotEntry,
} from "../../src/knowledge/assemble";
import { documentParagraphs, renderKnowledgeDocument } from "../../src/knowledge/document-export";

const TITLES = fixture.site_links.links.map((item) => item.title);
const URLS = fixture.site_links.links.map((item) => item.url);
const clone = () => structuredClone(fixture);
const withoutLinks = () => {
  const copy = clone();
  copy.site_links = { links: [] };
  return copy;
};
const business = () => {
  const x = clone();
  return {
    company_foundation: x.company_foundation,
    positioning: x.positioning,
    market_and_customers: x.market_and_customers,
    branding_and_style: x.branding_and_style,
    online_presence: x.online_presence,
    site_links: x.site_links,
    key_people: x.key_people,
    offerings: x.offerings,
  };
};

/** Same projection the repo's knowledge tests use: one SnapshotEntry per provenance manifest row. */
function entries(): SnapshotEntry[] {
  const data = clone() as unknown as Record<string, any>;
  const p = data.provenance;
  return p.entries.map((entry: any, index: number) => {
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
        claims: p.claims.filter((c: any) => c.entry_id === entry.entry_id),
        coverage: p.coverage.flatMap((c: any) => {
          const targets = c.targets.filter((t: string) => t.startsWith(`${root}/`) || t === root);
          return targets.length ? [{ ...c, targets }] : [];
        }),
        operations: p.operations.filter((o: any) => o.entry_id === entry.entry_id),
      }),
    } as SnapshotEntry;
  });
}
const siteLinksEntry = (rows: SnapshotEntry[]) => rows.find((row) => (row.kind as string) === "site_links")!;
const assemble = (rows: SnapshotEntry[]) =>
  assembleKnowledgeBase({
    company: { id: fixture.company_id, name: "Lumen Ledger", website: "https://lumen-ledger.example/" },
    snapshotId: fixture.knowledge_base_version_id,
    version: 1,
    savedAt: "2026-10-16T04:59:00Z",
    authorId: fixture.provenance.company.snapshot_author_id,
    entries: rows,
  });
/** Positive-path assembly: a failure to assemble is reported as an assertion, not an incidental TypeError. */
function assembleOk(rows: SnapshotEntry[]) {
  let snapshot: ReturnType<typeof assemble> | undefined;
  expect(() => { snapshot = assemble(rows); }, "assembling approved entries must succeed").not.toThrow();
  return snapshot!;
}
const linksOf = (snapshot: unknown) => (snapshot as { site_links?: { links?: unknown[] } }).site_links?.links;

describe("export snapshots carry site_links", () => {
  it("KnowledgeBaseExportSchema accepts a snapshot with a populated site_links section", () => {
    expect(KnowledgeBaseExportSchema.safeParse(fixture).success).toBe(true);
    expect(KnowledgeBaseExportSchema.safeParse(withoutLinks()).success).toBe(true);
  });

  it("site_links is required in the export, like the other singleton sections", () => {
    const { site_links: _omitted, ...missing } = clone();
    expect(KnowledgeBaseExportSchema.safeParse(fixture).success).toBe(true);
    expect(KnowledgeBaseExportSchema.safeParse(missing).success).toBe(false);
  });

  it("Edge case: invalid links make the whole export invalid (relative URL, javascript:, duplicate ids)", () => {
    expect(KnowledgeBaseExportSchema.safeParse(fixture).success).toBe(true);
    const relative = clone();
    relative.site_links.links[0].url = "/about";
    const script = clone();
    script.site_links.links[0].url = "javascript:alert(1)";
    const duplicate = clone();
    duplicate.site_links.links[1].id = duplicate.site_links.links[0].id;
    for (const bad of [relative, script, duplicate]) {
      expect(KnowledgeBaseExportSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("Edge case: a link id may not collide with any other business id in the export", () => {
    expect(KnowledgeBaseExportSchema.safeParse(fixture).success).toBe(true);
    const collision = clone();
    collision.site_links.links[0].id = collision.key_people[0].id;
    expect(KnowledgeBaseExportSchema.safeParse(collision).success).toBe(false);
  });

  it("provenance manifest accepts the site_links entry kind", () => {
    const parsed = KnowledgeBaseExportSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.provenance.entries.some((entry) => (entry.kind as string) === "site_links")).toBe(true);
  });

  it("BusinessSchema parses the fixture's business sections including site_links", () => {
    expect(BusinessSchema.safeParse(business()).success).toBe(true);
  });
});

describe("provenance and coverage accept /site_links/links", () => {
  it("a complete user-provided claim + coverage assessment for the links validates with no issues", () => {
    expect(validateProvenance(business() as never, fixture.provenance as never)).toEqual([]);
  });

  it("an unclaimed link leaf is reported (provenance is enforced for site links)", () => {
    expect(validateProvenance(business() as never, fixture.provenance as never)).toEqual([]);
    const p = clone().provenance;
    p.claims = p.claims.filter((claim) => !claim.targets.some((t) => t.startsWith("/site_links/")));
    const issues = validateProvenance(business() as never, p as never);
    expect(issues.map((issue) => issue.code)).toContain("leaf_unclaimed");
    expect(issues.some((issue) => `${issue.path} ${issue.message}`.includes("site_links"))).toBe(true);
  });

  it("missing coverage for /site_links/links is reported", () => {
    expect(validateProvenance(business() as never, fixture.provenance as never)).toEqual([]);
    const p = clone().provenance;
    p.coverage = p.coverage.filter((item) => !item.targets.includes("/site_links/links"));
    expect(validateProvenance(business() as never, p as never).length).toBeGreaterThan(0);
  });

  it("duplicated coverage for /site_links/links is reported", () => {
    expect(validateProvenance(business() as never, fixture.provenance as never)).toEqual([]);
    const p = clone().provenance;
    p.coverage.push(p.coverage.find((item) => item.targets.includes("/site_links/links"))!);
    expect(validateProvenance(business() as never, p as never).map((issue) => issue.code)).toContain("coverage_count");
  });

  it("Edge case: empty links list needs coverage but no claims", () => {
    const empty = withoutLinks();
    empty.provenance.claims = empty.provenance.claims.filter((claim) => !claim.targets.some((t) => t.startsWith("/site_links/")));
    const b = { ...business(), site_links: { links: [] } };
    expect(validateProvenance(b as never, empty.provenance as never)).toEqual([]);
  });
});

describe("snapshot assembly treats site_links like any approved singleton", () => {
  it("includes approved links in order, the entry in the manifest, its claims and its coverage", () => {
    const snapshot = assembleOk(entries());
    expect(linksOf(snapshot)).toEqual(fixture.site_links.links);
    expect(snapshot.provenance.entries.filter((entry) => (entry.kind as string) === "site_links")).toHaveLength(1);
    const claimed = snapshot.provenance.claims.flatMap((claim) => claim.targets).filter((target) => target.startsWith("/site_links/"));
    expect(claimed.length).toBe(5);
    const coverage = snapshot.provenance.coverage.filter((item) => item.targets.includes("/site_links/links"));
    expect(coverage).toHaveLength(1);
    expect(coverage[0].status).toBe("not_checked");
    expect(KnowledgeBaseExportSchema.safeParse(snapshot).success).toBe(true);
  });

  it("a rejected site_links entry contributes nothing and is noted in coverage", () => {
    const rows = entries();
    siteLinksEntry(rows).review_status = "rejected";
    const snapshot = assembleOk(rows);
    expect((snapshot as { site_links?: unknown }).site_links).toEqual({ links: [] });
    const coverage = snapshot.provenance.coverage.find((item) => item.targets.includes("/site_links/links"));
    expect(coverage?.reason).toBe("Entry rejected and excluded by reviewer.");
    expect(snapshot.provenance.claims.some((claim) => claim.targets.some((t) => t.startsWith("/site_links/")))).toBe(false);
  });

  it("site_links stays optional: with no site_links entry the snapshot carries an empty list and a not-assessed coverage row", () => {
    const rows = entries().filter((row) => (row.kind as string) !== "site_links");
    const snapshot = assembleOk(rows);
    expect((snapshot as { site_links?: unknown }).site_links).toEqual({ links: [] });
    const coverage = snapshot.provenance.coverage.find((item) => item.targets.includes("/site_links/links"));
    expect(coverage).toMatchObject({ status: "not_checked", reason: "No approved entry assessed this field." });
  });

  it("an unreviewed site_links entry blocks publication like any other kind", () => {
    const rows = entries();
    siteLinksEntry(rows).review_status = "unreviewed";
    expect(previewPublication(rows).canPublish).toBe(false);
    expect(previewPublication(rows).blockingEntries.map((entry) => entry.entry_id)).toContain(siteLinksEntry(rows).entry_id);
    expect(() => assemble(rows)).toThrow(/Entry is unreviewed/);
  });

  it("Edge case: two approved site_links entries violate the singleton rule", () => {
    const rows = entries();
    rows.push({ ...structuredClone(siteLinksEntry(rows)), entry_id: "30000000-0000-4000-8000-000000000099", created_at: "2026-10-16T04:09:00Z" });
    expect(() => assemble(rows)).toThrow(/Duplicate singleton/);
  });

  it("Edge case: an approved entry holding an invalid link is refused when assembling", () => {
    const rows = entries();
    (siteLinksEntry(rows).content as unknown as { links: { url: string }[] }).links[0].url = "javascript:alert(1)";
    expect(() => assemble(rows)).toThrow(ZodError);
  });

  it("history: a snapshot is a frozen copy; later revisions only affect later snapshots", () => {
    const rows = entries();
    const first = assembleOk(rows);
    const frozen = structuredClone(first);
    const edited = siteLinksEntry(rows);
    (edited.content as unknown as { links: unknown[] }).links.push({
      id: "a1000000-0000-4000-8000-000000000003", title: "Security", url: "https://lumen-ledger.example/security", note: null,
    });
    edited.revision += 1;
    edited.provenance.claims[0].targets.push("/site_links/links/@a1000000-0000-4000-8000-000000000003/title", "/site_links/links/@a1000000-0000-4000-8000-000000000003/url");
    const second = assembleOk(rows);
    expect(first).toEqual(frozen);
    expect(linksOf(first)).toHaveLength(2);
    expect(linksOf(second)).toHaveLength(3);
    expect(second.provenance.entries.find((entry) => (entry.kind as string) === "site_links")?.revision).toBe(2);
  });
});

describe("document export renders a 'Site links' section", () => {
  const paragraphsOf = (snapshot: unknown) => documentParagraphs({ kind: "snapshot", snapshot: snapshot as never });
  const sectionOf = (snapshot: unknown, title: string) => {
    const paragraphs = paragraphsOf(snapshot);
    const start = paragraphs.findIndex((item) => item.heading === "section" && item.text === title);
    if (start < 0) {
      return null;
    }
    const rest = paragraphs.slice(start + 1);
    const end = rest.findIndex((item) => item.heading === "section");
    return { start, body: (end < 0 ? rest : rest.slice(0, end)).map((item) => item.text).join("\n") };
  };

  it("lists every approved link's title and URL under a 'Site links' heading, in order", () => {
    const section = sectionOf(fixture, "Site links");
    expect(section, "a section heading named exactly 'Site links'").not.toBeNull();
    for (const text of [...TITLES, ...URLS]) {
      expect(section!.body).toContain(text);
    }
    expect(section!.body.indexOf(TITLES[0])).toBeLessThan(section!.body.indexOf(TITLES[1]));
    expect(section!.body.indexOf(URLS[0])).toBeLessThan(section!.body.indexOf(URLS[1]));
  });

  it("each link's title is shown with its own URL (not just two unrelated lists)", () => {
    const section = sectionOf(fixture, "Site links");
    expect(section).not.toBeNull();
    const lines = section!.body.split("\n");
    fixture.site_links.links.forEach((item) => {
      expect(lines.some((line) => line.includes(item.title) && line.includes(item.url)) ||
        lines.findIndex((line) => line.includes(item.title)) + 1 === lines.findIndex((line) => line.includes(item.url)) ||
        lines.findIndex((line) => line.includes(item.url)) + 1 === lines.findIndex((line) => line.includes(item.title))).toBe(true);
    });
  });

  it("appears in the business body, before 'Coverage & unknowns'", () => {
    const paragraphs = paragraphsOf(fixture);
    const sites = paragraphs.findIndex((item) => item.heading === "section" && item.text === "Site links");
    const coverage = paragraphs.findIndex((item) => item.heading === "section" && item.text === "Coverage & unknowns");
    expect(sites).toBeGreaterThanOrEqual(0);
    expect(coverage).toBeGreaterThan(sites);
  });

  it("Edge case: the section is omitted when there are no links", () => {
    const empty = withoutLinks();
    const paragraphs = paragraphsOf(empty);
    const coverage = paragraphs.findIndex((item) => item.heading === "section" && item.text === "Coverage & unknowns");
    expect(coverage).toBeGreaterThan(0);
    // Sanity: the document still has real content, so this is not an empty-render artefact.
    expect(paragraphs.some((item) => item.heading === "section" && item.text === "Key people")).toBe(true);
    expect(paragraphs.some((item) => item.heading === "section" && item.text === "Site links")).toBe(false);
    expect(paragraphs.slice(0, coverage).map((item) => item.text).join("\n")).not.toMatch(/Site links/i);
  });

  it("Edge case: the section is omitted when site_links is entirely absent from the object (older snapshot shape)", () => {
    const { site_links: _omitted, ...legacy } = clone();
    const paragraphs = paragraphsOf(legacy);
    expect(paragraphs.some((item) => item.heading === "section" && item.text === "Key people")).toBe(true);
    expect(paragraphs.some((item) => item.heading === "section" && item.text === "Site links")).toBe(false);
  });

  it("other sections are unaffected by the new section", () => {
    const withSection = paragraphsOf(fixture).filter((item) => item.heading === "section" && item.text !== "Site links").map((item) => item.text);
    const without = paragraphsOf(withoutLinks()).filter((item) => item.heading === "section").map((item) => item.text);
    expect(withSection).toEqual(without);
  });

  it("the OOXML document contains the section, titles and URLs, with markup escaped and only http(s) hyperlinks", async () => {
    const snapshot = clone();
    snapshot.site_links.links[0].title = '<script>alert("x")</script> & Partner "Hub"';
    const bytes = await renderKnowledgeDocument({ kind: "snapshot", snapshot: snapshot as never });
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    const text = load(xml, { xmlMode: true }).text();
    expect(text).toContain("Site links");
    expect(text).toContain(snapshot.site_links.links[0].title);
    expect(text).toContain(snapshot.site_links.links[1].title);
    for (const url of URLS) {
      expect(text).toContain(url);
    }
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
    const relationships = load(await zip.file("word/_rels/document.xml.rels")!.async("string"), { xmlMode: true });
    relationships('Relationship[TargetMode="External"]').each((_index, item) => {
      expect(relationships(item).attr("Target")).toMatch(/^https?:\/\//);
    });
  });

  it("the OOXML document omits the section when no links are approved", async () => {
    const bytes = await renderKnowledgeDocument({ kind: "snapshot", snapshot: withoutLinks() as never });
    const zip = await JSZip.loadAsync(bytes);
    const text = load(await zip.file("word/document.xml")!.async("string"), { xmlMode: true }).text();
    const body = text.split("Coverage & unknowns")[0];
    expect(text).toContain("Coverage & unknowns");
    expect(body).not.toContain("Site links");
  });

  it("end to end: only approved links reach the document (rejected entry omitted, approved entry listed)", () => {
    const approved = assembleOk(entries());
    expect(sectionOf(approved, "Site links")?.body).toContain(URLS[1]);
    const rows = entries();
    siteLinksEntry(rows).review_status = "rejected";
    const rejected = assembleOk(rows);
    expect(sectionOf(rejected, "Site links")).toBeNull();
    const rejectedText = paragraphsOf(rejected).map((item) => item.text).join("\n");
    expect(rejectedText).not.toContain(URLS[0]);
    expect(rejectedText).not.toContain(URLS[1]);
  });
});
