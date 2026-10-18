// Guards for the Site Knowledge / All sections acceptance tests (Quest knowledge-view-site-and-all):
// the fixtures are data the product could hold, and the interactive runtime that the behavioural
// tests drive really renders the viewer, re-renders after a click and serves the company API.
// These tests pass on the base commit; they fail only if the fixtures or the harness are wrong.
import { describe, expect, it } from "vitest";
import {
  EntryProvenanceSchema,
  KnowledgeBaseExportSchema,
  SiteLinksSchema,
  entryBusiness,
  validateProvenance,
} from "../../src/contracts";
import { DraftResponseSchema } from "../../src/contracts/api-responses";
import { SourceCoverageSchema } from "../../src/contracts/source-coverage";
import { upgradeLegacySnapshot } from "../../src/knowledge/legacy-snapshot";
import { openView, SECTION_IDS } from "../helpers/knowledge-view-site-all-runtime";
import { selectorItems } from "../helpers/knowledge-view-dom";
import { COMPANY_ID } from "../helpers/knowledge-view-fixtures";
import {
  FULL_INVENTORY,
  LINKS,
  SITE_ENTRY_ID,
  buildSiteEvidence,
  emptySiteDraft,
  hostileLinks,
  historicalOrigins,
  inventory,
  legacySnapshot,
  manyLinks,
  noSiteDraft,
  siteDraft,
  siteSnapshot,
  userProvenance,
  LISTED,
  NOT_LISTED,
  PAGES,
} from "../helpers/knowledge-view-site-all-fixtures";

const entryProvenance = (draft: ReturnType<typeof siteDraft>) => draft.entries.find((e) => e.kind === "site_links")!.provenance;

describe("fixtures are data the product could hold", () => {
  // guard
  it.each([
    ["four links", siteDraft()],
    ["an entry with no links", emptySiteDraft()],
    ["no site_links entry", noSiteDraft()],
    ["a viewer", siteDraft({ role: "viewer" })],
    ["an archived company", siteDraft({ archived: true })],
    ["499 links", siteDraft({ links: manyLinks(499) })],
    ["an empty entry assessed as not found", emptySiteDraft({ coverage: { status: "not_found", reason: "No sitemap page was captured." } })],
    ["every origin", buildSiteEvidence().draft],
  ])("the draft with %s satisfies DraftResponseSchema", (_name, draft) => {
    expect(() => DraftResponseSchema.parse(draft)).not.toThrow();
  });

  // guard
  it.each([
    ["four links", siteDraft()],
    ["no site_links entry", noSiteDraft()],
    ["an empty entry", emptySiteDraft()],
  ])("the snapshot of the draft with %s satisfies KnowledgeBaseExportSchema", (_name, draft) => {
    expect(() => KnowledgeBaseExportSchema.parse(siteSnapshot(draft).payload)).not.toThrow();
    expect(() => KnowledgeBaseExportSchema.parse(buildSiteEvidence().snapshot().payload)).not.toThrow();
  });

  // guard
  it("the stored links satisfy SiteLinksSchema (unique ids, absolute http(s) urls) and 499 links stay under the cap", () => {
    expect(() => SiteLinksSchema.parse({ links: LINKS })).not.toThrow();
    expect(() => SiteLinksSchema.parse({ links: manyLinks(499) })).not.toThrow();
    expect(() => SiteLinksSchema.parse({ links: manyLinks(500) })).not.toThrow();
    expect(() => SiteLinksSchema.parse({ links: manyLinks(501) })).toThrow();
    expect(() => SiteLinksSchema.parse({ links: hostileLinks() })).toThrow();
  });

  // guard
  it.each([
    ["four links", LINKS],
    ["an empty list", []],
    ["499 links", manyLinks(499)],
  ])("the entry provenance for %s has no validation issues (coverage included)", (_name, links) => {
    const provenance = userProvenance(links);
    expect(() => EntryProvenanceSchema.parse(provenance)).not.toThrow();
    expect(validateProvenance(entryBusiness("site_links", { links } as never), provenance)).toEqual([]);
  });

  // guard
  it("the evidence fixture's claims (source-backed and user-provided) validate, in the draft and in the snapshot", () => {
    const fx = buildSiteEvidence({ coverage: { status: "partial", reason: "Only the footer navigation was captured." } });
    const provenance = entryProvenance(fx.draft);
    expect(validateProvenance(entryBusiness("site_links", { links: fx.links } as never), provenance)).toEqual([]);
    expect(new Set(fx.claims.map((c) => c.origin))).toEqual(new Set(["source_backed", "user_provided"]));
    const snapshot = fx.snapshot().payload;
    expect(validateProvenance(snapshot as never, snapshot.provenance, { requireCoverage: false }).filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
  });

  // guard
  it("the historical-origin fixture breaks exactly one rule: site_links claims may only be source-backed or user-provided", () => {
    const fx = buildSiteEvidence({ origins: historicalOrigins() });
    const issues = validateProvenance(entryBusiness("site_links", { links: fx.links } as never), entryProvenance(fx.draft));
    expect(new Set(issues.map((i) => i.code))).toEqual(new Set(["origin_disallowed"]));
    expect(new Set(fx.claims.map((c) => c.origin))).toEqual(new Set(["source_backed", "inferred", "generated", "user_provided"]));
  });

  // guard
  it("the captured-page inventory satisfies SourceCoverageSchema and separates listed from unlisted pages", () => {
    expect(() => SourceCoverageSchema.parse(FULL_INVENTORY())).not.toThrow();
    expect(() => SourceCoverageSchema.parse(inventory([]))).not.toThrow();
    const urls = new Set(LINKS.map((l) => l.url));
    for (const page of LISTED) {
      expect(page.state).toBe("captured");
      expect(urls.has(page.url)).toBe(false);
    }
    expect(PAGES.untitled.title).toBeNull();
    for (const page of NOT_LISTED) {
      expect(page.state !== "captured" || urls.has(page.url)).toBe(true);
    }
  });

  // guard
  it("the legacy snapshot has no site_links; the reader's upgrade gives it an empty section and a coverage row", () => {
    const stored = legacySnapshot().payload;
    expect(Object.hasOwn(stored, "site_links")).toBe(false);
    const upgraded = KnowledgeBaseExportSchema.parse(upgradeLegacySnapshot(structuredClone(stored)));
    expect(upgraded.site_links.links).toEqual([]);
    expect(upgraded.provenance.coverage.some((c) => c.targets.includes("/site_links/links"))).toBe(true);
  });
});

describe("the interactive runtime", () => {
  // guard
  it("renders the viewer through the real server page, with the section selector's identifiers", async () => {
    const view = await openView({ draft: siteDraft() });
    const items = selectorItems(view.page());
    for (const [label, id] of Object.entries(SECTION_IDS)) {
      const item = items.find((i) => i.label === label);
      expect(item, `selector lists ${label}`).toBeDefined();
      expect(item!.value).toBe(id);
    }
    expect(view.page().$("h1").text()).toContain("Harbor & Pine Coffee Roasters");
  });

  // guard
  it("re-renders after a click: the Table display mode replaces the profile", async () => {
    const view = await openView({ draft: siteDraft() });
    expect(view.page().$("table").length).toBe(0);
    const [table] = view.byRole("button", "Table");
    expect(table, "a Table display-mode button").toBeDefined();
    await view.click(table);
    await view.settle();
    expect(view.page().$("table").length).toBe(1);
    expect(view.byRole("button", "Table")[0].props["aria-pressed"]).toBe(true);
  });

  // guard
  it("serves the company API from memory and records every request", async () => {
    const view = await openView({ draft: siteDraft(), server: (s) => { s.sources = FULL_INVENTORY(); } });
    const body: any = await (await view.server.fetch(`/api/companies/${COMPANY_ID}/sources`)).json();
    expect(body.data.pages).toHaveLength(FULL_INVENTORY().pages.length);
    const draft: any = await (await view.server.fetch(`/api/companies/${COMPANY_ID}/draft`)).json();
    expect(draft.data.entries.some((e: { id: string }) => e.id === SITE_ENTRY_ID)).toBe(true);
    expect(view.server.gets.map((r) => r.path)).toContain(`/api/companies/${COMPANY_ID}/sources`);
    expect(view.server.writes).toEqual([]);
  });

  // guard
  it("applies a revision to its own draft and refuses a stale expected revision with 409", async () => {
    const view = await openView({ draft: siteDraft() });
    const path = `/api/companies/${COMPANY_ID}/entries/${SITE_ENTRY_ID}/revisions`;
    const post = (expectedRevision: number) =>
      view.server.fetch(path, { method: "POST", body: JSON.stringify({ expectedRevision, content: { links: [] }, provenance: userProvenance([]), reviewStatus: "unreviewed", requestId: COMPANY_ID }) });
    expect((await post(1)).status).toBe(409);
    expect((await post(4)).status).toBe(200);
    expect(view.server.draft.entries.find((e: { id: string }) => e.id === SITE_ENTRY_ID).current_revision).toBe(5);
  });
});
