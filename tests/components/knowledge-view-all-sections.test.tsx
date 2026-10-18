// Acceptance: "All sections" of /knowledge/view. Selecting "All sections" renders every section in selector order, each under a visible
// section heading, with the same cards and values as the section on its own, for a draft and for a
// saved snapshot; no two elements share an id and the import control appears once.
//
// A section heading is a heading whose text is the selector's label (a count may follow it,
//   as "Business Offerings 4" does today); headings hidden with sr-only classes do not count.
// "the same content as the individual section" is compared as the normalized text of the
//   section's banner and cards (and the offerings list and detail, and the Site Knowledge card), with
//   the draft-only "Import from website" label removed.
import { describe, expect, it, vi } from "vitest";
import { openView, type SectionLabel, type View } from "../helpers/knowledge-view-site-all-runtime";
import {
  COMPANY_NAME,
  buildBusiness,
  buildEmptyDraft,
  draftFrom,
} from "../helpers/knowledge-view-fixtures";
import {
  card,
  cardText,
  headings,
  norm,
  selectedSection,
  selectorItems,
  textNodes,
  textOf,
  contains,
  sectionSelector,
  type Page,
} from "../helpers/knowledge-view-dom";
import { brandBanner, labelGroup, listRows, offeringsList } from "../helpers/knowledge-view-offerings-brand-dom";
import { peopleList } from "../helpers/knowledge-view-people-dom";
import {
  ALL_ORDER,
  ancestorsOf,
  addPageLinks,
  duplicateIds,
  importControls,
  orderIndex,
  sectionHeading,
  siteCard,
  siteCardText,
  siteHeading,
} from "../helpers/knowledge-view-site-all-dom";
import {
  LINKS,
  buildSiteEvidence,
  emptySiteDraft,
  noSiteDraft,
  siteAddHref,
  siteDraft,
  siteSnapshot,
  FULL_INVENTORY,
  PAGES,
} from "../helpers/knowledge-view-site-all-fixtures";
import { confirm, openPicker, selectPages, sentWrite } from "../helpers/knowledge-view-site-all-import";
import { COMPANY_ID } from "../helpers/knowledge-view-fixtures";
import type { Element } from "domhandler";

// Large lists (499 links) and many full-page renders: allow for a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

const GENERAL = ["Headquarters", "Alternate names", "Overview", "Founding story"];
const CUSTOMERS = ["Business model", "Company role", "Industry outlook", "Industry groupings", "Service locations", "Buyers", "Suppliers"];
const SALES = ["Pitch", "Ideal persona", "Customer needs", "Channels", "Calls to action", "Funnels"];
const BRAND = ["Logos", "Colors", "Fonts"];
const DETAIL = ["Offering", "Type", "Description", "Key features", "Cost", "Pricing model"];
const INDUSTRY = buildBusiness().company_foundation.industry!;

type Source = "draft" | "snapshot";
const sources = {
  draft: (label: SectionLabel, draft = siteDraft()) => openView({ section: label, draft }),
  snapshot: (label: SectionLabel, draft = siteDraft()) => openView({ section: label, snapshot: siteSnapshot(draft) }),
};

/** The banner of a section: the smallest container of its eyebrow label (a plain label, not a heading) and its heading. */
function bannerOf(page: Page, label: string, headingValue: string): Element | null {
  const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();
  const labels = textNodes(page).filter((t) => same(t.text, label) && !ancestorsOf(t.node).some((a) => /^h[1-6]$/.test(a.name)));
  const heads = headings(page).filter((h) => same(h.text, headingValue));
  const selector = sectionSelector(page);
  for (const l of labels) {
    for (const parent of ancestorsOf(l.node)) {
      if (selector && contains(parent, selector)) {
        break;
      }
      if (heads.some((h) => contains(parent, h.el))) {
        return parent;
      }
    }
  }
  return null;
}

const strip = (text: string) => text.replace(/Import from website/gi, "").replace(/\s+/g, " ").trim();
type Signature = Record<string, string | null>;
/** What the page shows of each section: banner and card texts, keyed by section and card. */
function signature(page: Page): Signature {
  const out: Signature = {};
  const cards = (section: string, titles: string[]) => {
    for (const title of titles) {
      const el = card(page, title, titles);
      out[`${section} / ${title}`] = el ? strip(cardText(page, el)) : null;
    }
  };
  const banner = (key: string, el: Element | null) => (out[key] = el ? strip(textOf(page, el)) : null);
  banner("General Info banner", bannerOf(page, "Company", COMPANY_NAME));
  cards("General Info", GENERAL);
  banner("Customers & Industry banner", bannerOf(page, "Industry", INDUSTRY));
  cards("Customers & Industry", CUSTOMERS);
  banner("Sales & Marketing banner", bannerOf(page, "Sales & Marketing", COMPANY_NAME));
  cards("Sales & Marketing", SALES);
  const list = offeringsList(page);
  out["Business Offerings list"] = list ? strip(listRows(page, list).map((row) => textOf(page, row)).join(" | ")) : null;
  for (const label of DETAIL) {
    const group = labelGroup(page, label, DETAIL);
    out[`Business Offerings / ${label}`] = group ? strip(textOf(page, group)) : null;
  }
  banner("Brand Identity banner", brandBanner(page, COMPANY_NAME));
  cards("Brand Identity", BRAND);
  const site = siteCard(page);
  out["Site Knowledge card"] = site ? strip(siteCardText(page, site)) : null;
  return out;
}
const INDIVIDUAL: Record<string, SectionLabel> = {
  "General Info": "General Info",
  "Customers & Industry": "Customers & Industry",
  "Sales & Marketing": "Sales & Marketing",
  "Business Offerings": "Business Offerings",
  "Brand Identity": "Brand Identity",
  "Site Knowledge": "Site Knowledge",
};
/** The sections the interactive runtime can open on their own (its SECTION_IDS has no Key People; the listbox tests cover that one). */
const SIX = ALL_ORDER.filter((label): label is Exclude<(typeof ALL_ORDER)[number], "Key People"> => label !== "Key People");
const sectionOfKey = (key: string) => Object.keys(INDIVIDUAL).find((s) => key.startsWith(s))!;

/** "+ Add page" buttons inside a card: the control of an editable draft (a snapshot keeps its link to the editor). */
const addPageButtons = (page: Page, el: Parameters<typeof addPageLinks>[1]) =>
  page.$(el as never).find("button").toArray().filter((b) => /^\+\s*add page$/i.test(norm(page.$(b).text())));

describe.each(["draft", "snapshot"] as const)("All sections (%s)", (source: Source) => {
  it("is selected by the selector and no longer shows the placeholder notice", async () => {
    const page = (await sources[source]("All sections")).page();
    expect(selectedSection(page)).toEqual(["All sections"]);
    expect(norm(page.$.root().text())).not.toMatch(/is not shown in this view yet/i);
  });

  it("renders a visible heading for every section, in selector order", async () => {
    const page = (await sources[source]("All sections")).page();
    const selectorLabels = selectorItems(page).map((i) => i.label).filter((l) => l !== "All sections");
    expect(selectorLabels).toEqual([...ALL_ORDER]);
    const index = orderIndex(page);
    const positions = ALL_ORDER.map((label) => {
      const el = sectionHeading(page, label);
      expect(el, `a heading "${label}"`).not.toBeNull();
      expect(page.$(el!).closest("[hidden],[aria-hidden=true],.sr-only,.visually-hidden").length, `"${label}" is visible`).toBe(0);
      return index.get(el!)!;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(ALL_ORDER.length);
  });

  it("each section's content lies under its own heading, before the next section's", async () => {
    const page = (await sources[source]("All sections")).page();
    const index = orderIndex(page);
    const at = (el: Element | null, what: string) => {
      expect(el, what).not.toBeNull();
      return index.get(el!)!;
    };
    const heading = (label: string) => at(sectionHeading(page, label), `heading ${label}`);
    const probe: Record<string, Element | null> = {
      "General Info": card(page, "Overview", GENERAL),
      "Customers & Industry": card(page, "Buyers", CUSTOMERS),
      "Sales & Marketing": card(page, "Pitch", SALES),
      "Business Offerings": offeringsList(page),
      "Brand Identity": card(page, "Logos", BRAND),
      // the people list when the company has people, else the empty state's link to the editor
      "Key People": peopleList(page) ?? page.$('a[href*="category=key_person"]').toArray()[0] ?? null,
      "Site Knowledge": siteHeading(page),
    };
    ALL_ORDER.forEach((label, i) => {
      const position = at(probe[label], `content of ${label}`);
      expect(position, `${label} content after its heading`).toBeGreaterThan(heading(label));
      if (i + 1 < ALL_ORDER.length) {
        expect(position, `${label} content before the next heading`).toBeLessThan(heading(ALL_ORDER[i + 1]));
      }
    });
  });

  it("shows the same banners, cards and values as each section on its own", async () => {
    const all = signature((await sources[source]("All sections")).page());
    for (const [key, value] of Object.entries(all)) {
      expect(value, `${key} is rendered in All sections`).not.toBeNull();
    }
    for (const label of SIX) {
      const alone = signature((await sources[source](label)).page());
      for (const key of Object.keys(all).filter((k) => sectionOfKey(k) === label)) {
        expect(alone[key], `${key} on its own`).not.toBeNull();
        expect(all[key], key).toBe(alone[key]);
      }
    }
  });

  it("no two elements share an id", async () => {
    const draft = buildSiteEvidence().draft;
    const page = (source === "draft" ? await openView({ section: "All sections", draft }) : await openView({ section: "All sections", snapshot: buildSiteEvidence().snapshot() })).page();
    // a page that renders only a placeholder has no duplicate ids either: require the six sections first
    for (const label of ALL_ORDER) {
      expect(sectionHeading(page, label), `a heading "${label}"`).not.toBeNull();
    }
    expect(page.$("button.citation-popover__trigger").length, "evidence controls of several sections are present").toBeGreaterThan(1);
    expect(duplicateIds(page)).toEqual([]);
  });

  it("contains the Site Knowledge card with its links and \"+ Add page\" (a link to the editor; a button on an editable draft)", async () => {
    const page = (await sources[source]("All sections")).page();
    const siteEl = siteCard(page);
    expect(siteEl, 'the card "Sitemap / Internal Links"').not.toBeNull();
    const text = siteCardText(page, siteEl!);
    for (const link of LINKS) {
      expect(text).toContain(link.title);
    }
    if (source === "draft") {
      expect(addPageLinks(page, siteEl!), "no link to the editor on an editable draft").toEqual([]);
      expect(addPageButtons(page, siteEl!), 'one "+ Add page" button').toHaveLength(1);
    } else {
      expect(addPageLinks(page, siteEl!)).toEqual([siteAddHref(COMPANY_ID)]);
    }
  });
});

describe("All sections, draft and snapshot agree", () => {
  it("a snapshot shows the same sections as the draft it was made from", async () => {
    const fx = buildSiteEvidence();
    // An owner's draft edits three of the sections in place, which a snapshot cannot; a viewer's draft reads like one.
    const readOnlyDraft = { ...fx.draft, company: { ...fx.draft.company, role: "viewer" as const } };
    const fromDraft = signature((await openView({ section: "All sections", draft: readOnlyDraft })).page());
    const fromSnapshot = signature((await openView({ section: "All sections", snapshot: fx.snapshot() })).page());
    expect(Object.values(fromDraft).every((v) => v), "the draft renders every section").toBe(true);
    expect(fromSnapshot).toEqual(fromDraft);
  });

  it("Edge case: a company with no entries still shows every section heading, the Site Knowledge empty state and no crash", async () => {
    const draft = buildEmptyDraft();
    const page = (await openView({ section: "All sections", draft })).page();
    for (const label of ALL_ORDER) {
      expect(sectionHeading(page, label), `a heading "${label}"`).not.toBeNull();
    }
    const siteEl = siteCard(page)!;
    expect(siteEl).not.toBeNull();
    expect(siteCardText(page, siteEl)).toMatch(/no (internal )?(links|pages)/i);
    // The empty company's draft is editable, so "+ Add page" is the dialog button, not a link to the editor.
    expect(addPageLinks(page, siteEl)).toEqual([]);
    expect(addPageButtons(page, siteEl), 'one "+ Add page" button').toHaveLength(1);
  });

  it("Edge case: a company with no offerings, no links and no brand data renders all six sections", async () => {
    const business = buildBusiness();
    business.offerings = [];
    business.branding_and_style.logos = [];
    const draft = draftFrom(business);
    const page = (await openView({ section: "All sections", draft })).page();
    for (const label of ALL_ORDER) {
      expect(sectionHeading(page, label), `a heading "${label}"`).not.toBeNull();
    }
    expect(norm(page.$.root().text())).toMatch(/no offerings yet/i);
    expect(siteCard(page)).not.toBeNull();
  });
});

describe("the import control in All sections", () => {
  it.each([
    ["links", siteDraft()],
    ["no links", emptySiteDraft()],
    ["no site_links entry", noSiteDraft()],
  ])("an editable draft with %s has exactly one Import from website button", async (_name, draft) => {
    const view = await sources.draft("All sections", draft);
    expect(view.byRole("button", /^import from website$/i)).toHaveLength(1);
    expect(importControls(view.page())).toHaveLength(1);
    expect(view.dialogs()).toHaveLength(0);
  });

  it.each([
    ["a saved snapshot", () => sources.snapshot("All sections")],
    ["a viewer", () => sources.draft("All sections", siteDraft({ role: "viewer" }))],
    ["an archived company", () => sources.draft("All sections", siteDraft({ archived: true }))],
  ])("%s has no import control", async (_name, make) => {
    const view = await make();
    expect(importControls(view.page())).toHaveLength(0);
    expect(siteCard(view.page()), "the Site Knowledge card is still shown").not.toBeNull();
  });

  it("the import works from All sections: one dialog, one save, and the new links appear in the Site Knowledge card", async () => {
    const view: View = await openView({
      section: "All sections",
      draft: siteDraft(),
      server: (server) => { server.sources = FULL_INVENTORY(); },
    });
    await openPicker(view);
    expect(view.dialogs()).toHaveLength(1);
    await selectPages(view, [PAGES.shop]);
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    expect(sent.content.links.at(-1)!.url).toBe(PAGES.shop.url);
    expect(view.dialogs()).toHaveLength(0);
    const page = view.page();
    expect(siteCardText(page, siteCard(page)!)).toContain("Shop our coffees");
    for (const label of ALL_ORDER) {
      expect(sectionHeading(page, label)).not.toBeNull();
    }
  });
});

describe("the individual sections are unchanged", () => {
  it("each individual section is selected alone, General Info without the Site Knowledge card", async () => {
    for (const label of SIX) {
      expect(selectedSection((await sources.draft(label)).page())).toEqual([label]);
    }
    expect(siteCard((await sources.draft("General Info")).page()), "General Info does not carry the Site Knowledge card").toBeNull();
    expect(card((await sources.draft("Site Knowledge")).page(), "Overview", GENERAL), "Site Knowledge does not carry General Info cards").toBeNull();
  });
});
