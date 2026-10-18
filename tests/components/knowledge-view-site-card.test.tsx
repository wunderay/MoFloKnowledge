// Acceptance: the Site Knowledge section of /knowledge/view (Quest knowledge-view-site-and-all):
// C1 the "Sitemap / Internal Links" card, C2 its empty state, C4 no import control when the data is
// not editable, C7 safe rendering, C8 saved snapshots. Assertions use headings, visible text,
// roles, hrefs and link attributes only; none depends on class names or markup depth.
//
// DECISION: the card heading is matched case-insensitively ("Sitemap / Internal Links" or
//   "Sitemap / Internal links"); the muted look of the description is untestable without CSS, so the
//   description is asserted as text outside the list items, links and buttons.
// DECISION: "+ Add page" is shown in a saved snapshot too, like the "+ Add" links of the other sections.
// DECISION: an external link carries target="_blank" with rel containing noopener and noreferrer.
import { describe, expect, it, vi } from "vitest";
import { openView, type View } from "../helpers/knowledge-view-site-all-runtime";
import { COMPANY_ID, buildBusiness, snapshotFrom } from "../helpers/knowledge-view-fixtures";
import { contains, norm, selectedSection, textNodes, type Page } from "../helpers/knowledge-view-dom";
import {
  BAD,
  addPageLinks,
  anchorsIn,
  importControls,
  linkItem,
  normalizedUrl,
  siteCard,
  siteCardText,
  siteHeading,
} from "../helpers/knowledge-view-site-all-dom";
import {
  HOSTILE,
  LINKS,
  SITE_HEADING,
  emptySiteDraft,
  hostileLinks,
  legacySnapshot,
  manyLinks,
  noSiteDraft,
  siteAddHref,
  siteDraft,
  siteSnapshot,
  SITE,
  buildSiteEvidence,
  COVERAGE_REASONS,
  historicalOrigins,
  type Link,
  type SiteEvidenceOptions,
} from "../helpers/knowledge-view-site-all-fixtures";

type Source = "draft" | "snapshot";
// Large lists (499 links) and many full-page renders: allow for a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

const open = {
  draft: (draft = siteDraft()) => openView({ section: "Site Knowledge", draft }),
  snapshot: (draft = siteDraft()) => openView({ section: "Site Knowledge", snapshot: siteSnapshot(draft) }),
};
const ADD = siteAddHref(COMPANY_ID);
/**
 * The "+ Add page" control of a card: a link to the editor in a saved snapshot, a button that opens the
 * add-page dialog on an editable draft (Quest add-page-modal). The link must not exist on a draft.
 */
function expectAddPage(page: Page, card: Parameters<typeof addPageLinks>[1], source: Source) {
  const buttons = page.$(card as never).find("button").toArray().filter((b) => /^\+\s*add page$/i.test(norm(page.$(b).text())));
  if (source === "draft") {
    expect(addPageLinks(page, card), "no link to the editor on an editable draft").toEqual([]);
    expect(buttons, 'one "+ Add page" button').toHaveLength(1);
  } else {
    expect(addPageLinks(page, card)).toEqual([ADD]);
    expect(buttons).toHaveLength(0);
  }
}

function cardOf(view: View) {
  const page = view.page();
  const card = siteCard(page);
  expect(card, 'a card headed "Sitemap / Internal Links"').not.toBeNull();
  return { page, card: card! };
}
const itemOf = (page: Page, card: NonNullable<ReturnType<typeof siteCard>>, link: Link, all: Link[] = LINKS) => {
  const item = linkItem(page, card, link, all);
  expect(item, `the card lists "${link.title}"`).not.toBeNull();
  return item!;
};

describe.each(["draft", "snapshot"] as const)("Site Knowledge card (%s)", (source: Source) => {
  // C1 behavioural
  it("opens from the selector as its own section and no longer shows the placeholder notice", async () => {
    const view = await open[source]();
    const page = view.page();
    expect(selectedSection(page)).toEqual(["Site Knowledge"]);
    expect(norm(page.$.root().text())).not.toMatch(/Site Knowledge is not shown in this view yet/i);
    expect(siteHeading(page), 'a heading "Sitemap / Internal Links"').not.toBeNull();
  });

  // C1 behavioural
  it("is a card headed \"Sitemap / Internal Links\" with a description and no form controls", async () => {
    const { page, card } = cardOf(await open[source]());
    expect(norm(page.$(siteHeading(page)!).text())).toMatch(SITE_HEADING);
    // description: text outside list items, links and buttons
    const outside = textNodes(page).filter(
      (t) => contains(card, t.node) && !page.$(t.el).closest("li,a,button,h1,h2,h3,h4,h5,h6,[role=heading]").length,
    );
    expect(outside.some((t) => t.text.length >= 20), "a description sentence under the heading").toBe(true);
    expect(page.$(card).find("input,textarea,select").length).toBe(0);
  });

  // C1 behavioural
  it("lists every stored link by title, once, in stored order", async () => {
    const { page, card } = cardOf(await open[source]());
    const text = siteCardText(page, card);
    const positions = LINKS.map((l) => text.indexOf(l.title));
    positions.forEach((p, i) => expect(p, `"${LINKS[i].title}" is listed`).toBeGreaterThanOrEqual(0));
    expect(positions, "stored order, not alphabetical or by URL").toEqual([...positions].sort((a, b) => a - b));
    for (const l of LINKS) {
      expect(text.split(l.title).length - 1, `"${l.title}" appears once`).toBe(1);
    }
  });

  // C1 behavioural
  it("renders each URL as an external link that opens the page with rel noopener noreferrer", async () => {
    const { page, card } = cardOf(await open[source]());
    for (const link of LINKS) {
      const anchors = anchorsIn(page, itemOf(page, card, link)).filter((a) => normalizedUrl(a.href) === normalizedUrl(link.url));
      expect(anchors.length, `a link to ${link.url}`).toBeGreaterThanOrEqual(1);
      for (const a of anchors) {
        expect(a.rel, link.url).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
        expect(a.target, link.url).toBe("_blank");
      }
    }
  });

  // C1 behavioural
  it("shows a note when there is one, and nothing (not \"null\") when there is not", async () => {
    const { page, card } = cardOf(await open[source]());
    for (const link of LINKS) {
      const item = norm(page.$(itemOf(page, card, link)).text());
      if (link.note) {
        expect(item, link.title).toContain(link.note);
      } else {
        expect(item, link.title).not.toMatch(BAD);
      }
    }
    expect(siteCardText(page, card)).not.toMatch(BAD);
  });

  // C1 behavioural
  it("ends with a \"+ Add page\" link to the editor (a button on an editable draft)", async () => {
    const { page, card } = cardOf(await open[source]());
    expectAddPage(page, card, source);
  });

  // C2 behavioural
  it("Edge case: an entry with an empty links list shows the empty state and still offers \"+ Add page\"", async () => {
    const { page, card } = cardOf(await open[source](emptySiteDraft()));
    expect(siteCardText(page, card)).toMatch(/no (internal )?(links|pages)/i);
    expectAddPage(page, card, source);
    expect(anchorsIn(page, card).filter((a) => /^https?:/.test(a.href))).toEqual([]);
    expect(siteCardText(page, card)).not.toMatch(BAD);
  });

  // C2 behavioural
  it("Edge case: a company with no site_links entry shows the same empty state and \"+ Add page\"", async () => {
    const { page, card } = cardOf(await open[source](noSiteDraft()));
    expect(siteCardText(page, card)).toMatch(/no (internal )?(links|pages)/i);
    expectAddPage(page, card, source);
    expect(siteCardText(page, card)).not.toMatch(BAD);
  });

  // C2 behavioural
  it("does not show the empty state when there are links", async () => {
    const { page, card } = cardOf(await open[source]());
    expect(siteCardText(page, card)).not.toMatch(/no (internal )?(links|pages)( yet)?/i);
  });
});

describe("Site Knowledge card, list edge cases (draft)", () => {
  // C1 behavioural
  it("Edge case: a single link is listed with its link and note", async () => {
    const only = [LINKS[0]];
    const { page, card } = cardOf(await openView({ section: "Site Knowledge", draft: siteDraft({ links: only }) }));
    expect(siteCardText(page, card)).toContain(only[0].title);
    expect(siteCardText(page, card)).toContain(only[0].note!);
    expect(anchorsIn(page, card).some((a) => normalizedUrl(a.href) === normalizedUrl(only[0].url))).toBe(true);
    expect(siteCardText(page, card)).not.toMatch(/no (internal )?(links|pages)/i);
  });

  // C1 behavioural
  it("Edge case: sixty links are all listed, each with its own address, in stored order", async () => {
    const links = manyLinks(60);
    const { page, card } = cardOf(await openView({ section: "Site Knowledge", draft: siteDraft({ links }) }));
    const hrefs = anchorsIn(page, card).map((a) => normalizedUrl(a.href)).filter((h) => h.startsWith(`${SITE}/generated/`));
    expect([...new Set(hrefs)]).toEqual(links.map((l) => normalizedUrl(l.url)));
  });

  // C1 behavioural
  it("Edge case: two links with the same title keep their own addresses", async () => {
    const links: Link[] = [
      { ...LINKS[0], title: "Contact" , url: `${SITE}/contact`, note: null },
      { ...LINKS[1], title: "Contact", url: `${SITE}/contact-us`, note: null },
    ];
    const { page, card } = cardOf(await openView({ section: "Site Knowledge", draft: siteDraft({ links }) }));
    const hrefs = anchorsIn(page, card).map((a) => normalizedUrl(a.href));
    expect(hrefs).toEqual(expect.arrayContaining([normalizedUrl(links[0].url), normalizedUrl(links[1].url)]));
    expect(siteCardText(page, card).split("Contact").length - 1).toBeGreaterThanOrEqual(2);
  });

  // C1 behavioural
  it("Edge case: a very long URL is linked unchanged", async () => {
    const long = `${SITE}/search?q=${"coffee-".repeat(280)}end`;
    const links: Link[] = [{ ...LINKS[0], url: long }];
    const { page, card } = cardOf(await openView({ section: "Site Knowledge", draft: siteDraft({ links }) }));
    expect(anchorsIn(page, card).some((a) => a.href === long || normalizedUrl(a.href) === normalizedUrl(long))).toBe(true);
  });

  // C1 behavioural
  it("the other sections' values are not part of the Site Knowledge section", async () => {
    const { page } = cardOf(await open.draft());
    const text = norm(page.$.root().text());
    expect(text).not.toContain(buildBusiness().company_foundation.overview!);
    expect(text).not.toContain("Morning-ritual Mia");
  });
});

describe("C4 no import control when the data cannot be edited", () => {
  const cases: [string, () => Promise<View>][] = [
    ["a saved snapshot", () => open.snapshot()],
    ["a saved snapshot with no links", () => open.snapshot(emptySiteDraft())],
    ["a viewer of the draft", () => open.draft(siteDraft({ role: "viewer" }))],
    ["a viewer of the draft with no links", () => open.draft(emptySiteDraft({ role: "viewer" }))],
    ["an archived company", () => open.draft(siteDraft({ archived: true }))],
    ["an archived company with no site_links entry", () => open.draft(noSiteDraft({ archived: true }))],
  ];
  // C4 behavioural
  it.each(cases)("%s: there is no Import from website control", async (_name, make) => {
    const view = await make();
    const { page, card } = cardOf(view);
    expect(importControls(page)).toHaveLength(0);
    expect(view.dialogs()).toHaveLength(0);
    // control: the read-only card still shows its content
    expect(siteCardText(page, card).length).toBeGreaterThan(20);
  });

  // C4 behavioural
  it("control: the owner of an editable draft has exactly one Import from website button, with links and without", async () => {
    for (const draft of [siteDraft(), emptySiteDraft(), noSiteDraft()]) {
      const view = await open.draft(draft);
      const buttons = view.byRole("button", /^import from website$/i);
      expect(buttons, "one import button").toHaveLength(1);
      expect(view.dialogs(), "the picker is closed until it is asked for").toHaveLength(0);
    }
  });
});

describe("C7 safe rendering of stored links", () => {
  const hostile = () => open.draft(siteDraft({ links: hostileLinks() }));

  // C7 behavioural
  it("only http(s) URLs become hrefs; other schemes, relative and protocol-relative addresses stay text", async () => {
    const { page, card } = cardOf(await hostile());
    const links = hostileLinks();
    const unsafe = links.slice(0, 5);
    for (const link of unsafe) {
      const item = itemOf(page, card, link, links);
      const hrefs = anchorsIn(page, item).map((a) => a.href);
      expect(hrefs, link.title).toEqual([]);
      expect(norm(page.$(item).text()), `${link.title} is still listed`).toContain(link.title);
    }
    for (const link of links) {
      for (const a of anchorsIn(page, itemOf(page, card, link, links))) {
        expect(a.href, link.title).toMatch(/^https?:\/\//i);
      }
    }
    // control: the valid link beside them is a real link
    const control = anchorsIn(page, itemOf(page, card, links[6], links));
    expect(control.map((a) => a.href)).toContain(`${SITE}/control`);
  });

  // C7 behavioural
  it("titles and notes render as text: markup in them is escaped, never parsed", async () => {
    const view = await hostile();
    const { page, card } = cardOf(view);
    const html = view.html();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(page.$("script").length).toBe(0);
    expect(page.$("img[onerror]").length).toBe(0);
    expect(page.$(card).find("b").length).toBe(0);
    const text = siteCardText(page, card);
    expect(text).toContain(HOSTILE.title.replace(/\s+/g, " "));
    expect(text).toContain(HOSTILE.note);
  });

  // C7 behavioural
  it("an http link in upper case and with a query string is still linked (as the browser normalizes it)", async () => {
    const links: Link[] = [{ ...LINKS[0], url: "HTTPS://WWW.HARBORANDPINE.EXAMPLE/Visit?x=1&y=2" }];
    const { page, card } = cardOf(await openView({ section: "Site Knowledge", draft: siteDraft({ links }) }));
    expect(anchorsIn(page, card).some((a) => normalizedUrl(a.href) === normalizedUrl(links[0].url))).toBe(true);
  });
});

describe("C8 saved snapshots", () => {
  const strip = (text: string) => text.replace(/Import from website/gi, "").replace(/\s+/g, " ").trim();

  // C8 behavioural
  it("a snapshot renders the same card as the draft it was made from (links, evidence and coverage alike)", async () => {
    const cases: SiteEvidenceOptions[] = [
      {},
      { links: [], coverage: { status: "not_found", reason: COVERAGE_REASONS.notFound } },
      { coverage: { status: "partial", reason: COVERAGE_REASONS.partial } },
      { origins: historicalOrigins() },
    ];
    for (const opts of cases) {
      const fx = buildSiteEvidence(opts);
      const a = cardOf(await openView({ section: "Site Knowledge", draft: fx.draft }));
      const b = cardOf(await openView({ section: "Site Knowledge", snapshot: fx.snapshot() }));
      expect(siteCardText(a.page, a.card).length, "the draft card has content").toBeGreaterThan(20);
      expect(strip(siteCardText(b.page, b.card))).toBe(strip(siteCardText(a.page, a.card)));
      // The draft's "+ Add page" is a button and the snapshot's a link to the editor: compare the other anchors.
      const others = (x: { href: string }) => x.href !== ADD;
      expect(anchorsIn(b.page, b.card).filter(others).map((x) => x.href)).toEqual(anchorsIn(a.page, a.card).filter(others).map((x) => x.href));
    }
    const plain = noSiteDraft();
    const a = cardOf(await open.draft(plain));
    const b = cardOf(await open.snapshot(plain));
    expect(strip(siteCardText(b.page, b.card))).toBe(strip(siteCardText(a.page, a.card)));
  });

  // C8 behavioural
  it("Edge case: a snapshot saved before site_links existed shows the empty state, without crashing", async () => {
    const view = await openView({ section: "Site Knowledge", snapshot: legacySnapshot() });
    const { page, card } = cardOf(view);
    expect(siteCardText(page, card)).toMatch(/no (internal )?(links|pages)/i);
    expect(addPageLinks(page, card)).toEqual([ADD]);
    expect(importControls(page)).toHaveLength(0);
    expect(siteCardText(page, card)).not.toMatch(BAD);
  });

  // C8 behavioural
  it("Edge case: a snapshot whose site_links entry was rejected shows the empty state and keeps the other sections", async () => {
    const draft = siteDraft();
    const view = await openView({ section: "Site Knowledge", snapshot: { payload: snapshotFrom(draft, { rejected: ["site_links"] }), versionId: siteSnapshot().versionId } });
    const { page, card } = cardOf(view);
    expect(siteCardText(page, card)).toMatch(/no (internal )?(links|pages)/i);
    expect(siteCardText(page, card)).not.toContain(LINKS[0].title);
  });

  // C8 behavioural
  it("the links of an evidence-carrying snapshot are listed like the draft's", async () => {
    const fx = buildSiteEvidence();
    const { page, card } = cardOf(await openView({ section: "Site Knowledge", snapshot: fx.snapshot() }));
    const text = siteCardText(page, card);
    for (const l of LINKS) {
      expect(text).toContain(l.title);
    }
  });
});
