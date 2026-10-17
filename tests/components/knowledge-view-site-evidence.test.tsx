// Acceptance: evidence and accessible names on the Site Knowledge card (Quest knowledge-view-site-and-all,
// C6 and C8). The card reuses the viewer's existing evidence control. A source-backed link relies on the
// card's field-level Sources control; a link with user-provided (or, in historical data, inferred or
// generated) claims also carries its own marker named by the link's title; coverage reasons are printed
// when the list is empty or not found. Draft and saved snapshot behave alike.
//
// DECISION: the product's field registry allows only source_backed and user_provided claims for
//   site_links, so the inferred and generated markers are tested with deliberately schema-invalid
//   historical data (labelled as such) and may be absent from real data.
// DECISION: a marker's accessible name is "<origin label>: evidence for <link title>" (the existing control's
//   own format); the test requires the origin label, the title, and no '@', '/' or UUID.
import { describe, expect, it } from "vitest";
import { openView } from "../helpers/knowledge-view-site-all-runtime";
import { norm, type Page } from "../helpers/knowledge-view-dom";
import { linkItem, siteCard, siteCardText } from "../helpers/knowledge-view-site-all-dom";
import {
  COVERAGE_REASONS,
  LINKS,
  buildSiteEvidence,
  emptySiteDraft,
  historicalOrigins,
  legacySnapshot,
  siteDraft,
  type SiteEvidenceOptions,
} from "../helpers/knowledge-view-site-all-fixtures";

const UUID_IN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;
const open = {
  draft: (opts: SiteEvidenceOptions = {}) => openView({ section: "Site Knowledge", draft: buildSiteEvidence(opts).draft }),
  snapshot: (opts: SiteEvidenceOptions = {}) => openView({ section: "Site Knowledge", snapshot: buildSiteEvidence(opts).snapshot() }),
};
function textOfCard(page: Page): string {
  const card = siteCard(page);
  expect(card, 'a card headed "Sitemap / Internal Links"').not.toBeNull();
  return siteCardText(page, card!);
}
const TRIGGER = "button.citation-popover__trigger";

function parts(page: Page) {
  const card = siteCard(page);
  expect(card, 'a card headed "Sitemap / Internal Links"').not.toBeNull();
  const all = page.$(card!).find(TRIGGER).toArray();
  const inLink = (el: (typeof all)[number]) => page.$(el).closest("li").length > 0;
  const name = (el: (typeof all)[number]) => page.$(el).attr("aria-label") ?? "";
  return {
    card: card!,
    field: all.filter((el) => !inLink(el)).map((el) => ({ name: name(el), shown: norm(page.$(el).text()) })),
    all: all.map((el) => ({ name: name(el), shown: norm(page.$(el).text()) })),
    markersOf: (index: number, links = LINKS) => {
      const item = linkItem(page, card!, links[index]!, links);
      expect(item, `the card lists "${links[index]!.title}"`).not.toBeNull();
      return page.$(item!).find(TRIGGER).toArray().map((el) => ({ name: name(el), shown: norm(page.$(el).text()) }));
    },
  };
}

describe.each(["draft", "snapshot"] as const)("Site Knowledge evidence (%s)", (source) => {
  // C6 behavioural
  it("shows a field-level evidence control on the card when links have claims, outside the link items", async () => {
    const { field } = parts((await open[source]()).page());
    expect(field.length, "a control for the whole list").toBeGreaterThanOrEqual(1);
    for (const c of field) {
      expect(c.name).not.toContain("@");
      expect(c.name).not.toMatch(UUID_IN);
    }
  });

  // C6 behavioural
  it("a card whose claims are all source-backed offers a \"Sources\" control", async () => {
    const view = await open[source]({ origins: { 0: "source_backed", 1: "source_backed", 2: "source_backed", 3: "source_backed" } });
    const { field, all } = parts(view.page());
    expect(field.map((c) => c.shown)).toContain("Sources ⓘ");
    expect(all.length, "source-backed links carry no marker of their own").toBe(field.length);
  });

  // C6 behavioural
  it("a user-corrected link carries its own marker named by its title; source-backed links carry none", async () => {
    const parted = parts((await open[source]()).page());
    expect(parted.markersOf(0)).toEqual([]);
    expect(parted.markersOf(2)).toEqual([]);
    for (const index of [1, 3]) {
      const markers = parted.markersOf(index);
      expect(markers, LINKS[index]!.title).toHaveLength(1);
      expect(markers[0]!.name).toBe(`User correction: evidence for ${LINKS[index]!.title}`);
      expect(markers[0]!.shown).toBe("User correction ⓘ");
    }
  });

  // C6 behavioural
  it("no evidence control is named by a raw id, pointer or path", async () => {
    const { all } = parts((await open[source]()).page());
    expect(all.length).toBeGreaterThan(2);
    for (const c of all) {
      expect(c.name).not.toContain("@");
      expect(c.name).not.toMatch(UUID_IN);
      expect(c.name).not.toMatch(/\/site_links|\/links/);
    }
  });

  // C6 behavioural (historical data outside today's registry)
  it("historical inferred and generated link claims are marked by origin and named by the link's title", async () => {
    const parted = parts((await open[source]({ origins: historicalOrigins() })).page());
    const inferred = parted.markersOf(1);
    const generated = parted.markersOf(2);
    expect(inferred).toHaveLength(1);
    expect(inferred[0]!.name).toBe(`Historical inferred: evidence for ${LINKS[1]!.title}`);
    expect(generated).toHaveLength(1);
    expect(generated[0]!.name).toMatch(new RegExp(`^Historical generated( · approved)?: evidence for ${LINKS[2]!.title}$`));
    expect(parted.markersOf(0)).toEqual([]);
    expect(parted.markersOf(3)).toHaveLength(1);
    for (const c of parted.all) {
      expect(c.name).not.toContain("@");
      expect(c.name).not.toMatch(UUID_IN);
    }
  });

  // C6 behavioural
  it("an empty list prints why it is empty: the coverage reason of a not-found assessment", async () => {
    const opts = { links: [], coverage: { status: "not_found" as const, reason: COVERAGE_REASONS.notFound } };
    const page = (await open[source](opts)).page();
    const text = textOfCard(page);
    expect(text).toContain(COVERAGE_REASONS.notFound);
    expect(text).toMatch(/not found in checked pages/i);
    expect(text).toMatch(/no (internal )?(links|pages)/i);
  });

  // C6 behavioural
  it("a list that is only partly found prints its reason next to the links; a fully found list prints none", async () => {
    const partial = (await open[source]({ coverage: { status: "partial", reason: COVERAGE_REASONS.partial } })).page();
    expect(textOfCard(partial)).toContain(COVERAGE_REASONS.partial);
    expect(textOfCard(partial)).toContain(LINKS[0]!.title);
    const found = (await open[source]()).page();
    expect(textOfCard(found)).not.toMatch(/partial|not found in checked|conflicting|unknown ·/i);
  });

  // C6 behavioural
  it("Edge case: a conflicting assessment is labelled as such", async () => {
    const page = (await open[source]({ coverage: { status: "conflict", reason: "Two navigation menus list different pages." } })).page();
    expect(textOfCard(page)).toContain("Two navigation menus list different pages.");
    expect(textOfCard(page)).toMatch(/conflicting sources/i);
  });
});

describe("Site Knowledge evidence, draft and snapshot agree", () => {
  // C8 behavioural
  it("a snapshot shows the same evidence controls as its draft", async () => {
    for (const opts of [{}, { origins: historicalOrigins() }]) {
      const fromDraft = parts((await open.draft(opts)).page());
      const fromSnapshot = parts((await open.snapshot(opts)).page());
      expect(fromDraft.all.length).toBeGreaterThan(2);
      expect(fromSnapshot.all).toEqual(fromDraft.all);
    }
  });

  // C8 behavioural
  it("a snapshot saved before site_links existed prints the recorded coverage reason on its empty card", async () => {
    const view = await openView({ section: "Site Knowledge", snapshot: legacySnapshot() });
    const page = view.page();
    const text = textOfCard(page);
    expect(text).toContain("No approved entry assessed this field.");
    expect(text).toMatch(/no (internal )?(links|pages)/i);
  });

  // C6 behavioural
  it("Edge case: a company with no site_links entry and no assessment says the field was not assessed", async () => {
    const view = await openView({ section: "Site Knowledge", draft: emptySiteDraft({ coverage: null }) });
    const page = view.page();
    expect(textOfCard(page)).toMatch(/not assessed|no assessment/i);
  });

  // C6 behavioural
  it("Edge case: plain links without any provenance still list normally", async () => {
    const draft = siteDraft();
    draft.entries.find((e) => e.kind === "site_links")!.provenance = { sources: [], evidence: [], claims: [], coverage: [], operations: [], conflicts: [], decisions: [] } as never;
    const page = (await openView({ section: "Site Knowledge", draft })).page();
    const text = textOfCard(page);
    for (const link of LINKS) expect(text).toContain(link.title);
  });
});
