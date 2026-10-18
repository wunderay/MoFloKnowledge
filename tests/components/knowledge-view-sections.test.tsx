// Acceptance: the first three reference sections of /knowledge/view and their
// empty states (Quest knowledge-view-shell, criteria C2, C3, C4, C5).
// Every assertion is on headings, labels, displayed values, link hrefs and the
// absence of form controls; none depends on class names or markup depth.
import { describe, expect, it } from "vitest";
import { createEmptyBusiness } from "../../src/contracts";
import { DraftResponseSchema } from "../../src/contracts/api-responses";
import {
  COMPANY_ID,
  COMPANY_NAME,
  EMPTY_COMPANY_ID,
  FOUNDING_STORY,
  OVERVIEW,
  buildBusiness,
  buildDraft,
  buildEmptyDraft,
  draftFrom,
} from "../helpers/knowledge-view-fixtures";
import {
  addLinks,
  banner,
  card,
  cardText,
  controlsIn,
  headings,
  norm,
  separateChips,
  socialColumn,
  statGroup,
  statShows,
  statValue,
  textOf,
  type Page,
} from "../helpers/knowledge-view-dom";
import {
  CARDS_BY_SECTION,
  CUSTOMER_STATS,
  GENERAL_STATS,
  LOCKED_SECTIONS,
  openSection,
  titlesOf,
  type LockedSection,
} from "../helpers/knowledge-view-spec";

const business = buildBusiness();
const cf = business.company_foundation;
const mc = business.market_and_customers;
const texts = (items: { text: string }[]) => items.map((i) => i.text);

/** Every card of a section, asserting each exists. */
function cardsOf(page: Page, section: LockedSection) {
  const titles = titlesOf(section);
  return Object.fromEntries(
    titles.map((title) => {
      const el = card(page, title, titles);
      expect(el, `section "${section}" should have a card headed "${title}"`).not.toBeNull();
      return [title, el!];
    }),
  );
}
const body = (page: Page, el: Element) => cardText(page, el);
/** The same draft, seen by a viewer: nothing is edited in place and "+ Add" leads to the advanced editor. */
const viewerOf = (draft: ReturnType<typeof buildDraft>) => ({ ...draft, company: { ...draft.company, role: "viewer" as const } });
/** The cards an owner edits in place (Quest inline-edit-core), and the accessible name of the control that does it. */
const INLINE_CONTROL: Record<string, string> = {
  "Alternate names": "Add alternate name",
  Overview: "Edit Overview",
  "Founding story": "Edit Founding story",
  "Business model": "Edit Business model",
  "Company role": "Add company role",
  "Industry groupings": "Add industry grouping",
  "Service locations": "Add service location",
  Buyers: "Add buyer",
  Pitch: "Edit Pitch",
  "Customer needs": "Add customer need",
};
/** The names of the buttons that edit a card's values in place (Edit …, Add …, Remove …). */
const inlineControls = (page: Page, el: Element) =>
  page.$(el).find("button").toArray().map((b) => page.$(b).attr("aria-label") ?? "").filter((name) => /^(edit|add) /i.test(name));
type Element = NonNullable<ReturnType<typeof card>>;
function expectInOrder(page: Page, titles: string[]) {
  const all = headings(page).map((h) => h.text.toLowerCase());
  const positions = titles.map((t) => all.indexOf(t.toLowerCase()));
  expect(positions.every((p) => p >= 0), `headings ${titles.join(", ")} all present`).toBe(true);
  expect(positions, "cards appear in the listed order").toEqual([...positions].sort((a, b) => a - b));
}

describe("fixtures", () => {
  // guard: the fixtures are valid product data, so the tests describe real inputs
  it("are a valid DraftResponse for a company that is not the owner's", () => {
    expect(() => DraftResponseSchema.parse(buildDraft())).not.toThrow();
    expect(() => DraftResponseSchema.parse(buildEmptyDraft())).not.toThrow();
    expect(buildEmptyDraft().entries).toEqual([]);
    expect(COMPANY_NAME).toBe("Harbor & Pine Coffee Roasters");
  });
});

describe("C2 General Info", () => {
  // behavioural
  it("has a banner labelled Company, headed by the company name, with Founded / Employees / Legal entity", async () => {
    const page = await openSection("General Info");
    const el = banner(page, "Company", COMPANY_NAME);
    expect(el, 'banner with label "Company" and the company name as heading').not.toBeNull();
    expect(statShows(page, el!, "Founded", GENERAL_STATS, 2014)).toBe(true);
    expect(statShows(page, el!, "Employees", GENERAL_STATS, 38)).toBe(true);
    expect(statShows(page, el!, "Legal entity", GENERAL_STATS, "Limited Liability Company (LLC)")).toBe(true);
  });

  // behavioural
  it("lists the Headquarters, Alternate names, Overview and Founding story cards in order", async () => {
    const page = await openSection("General Info");
    cardsOf(page, "General Info");
    expectInOrder(page, titlesOf("General Info"));
  });

  // behavioural
  it("Headquarters shows the main address and the other locations", async () => {
    const page = await openSection("General Info");
    const text = body(page, cardsOf(page, "General Info").Headquarters);
    for (const part of ["212 Wharf Street", "Portland", "48 Baxter Boulevard", "9 Industrial Way", "Westbrook"]) {
      expect(text).toContain(part);
    }
  });

  // behavioural
  it("Alternate names shows one chip per name", async () => {
    const page = await openSection("General Info");
    const el = cardsOf(page, "General Info")["Alternate names"];
    expect(separateChips(page, el, texts(cf.alternative_company_names))).toBeNull();
  });

  // behavioural
  it("Overview and Founding story show their full text", async () => {
    const page = await openSection("General Info");
    const cards = cardsOf(page, "General Info");
    expect(body(page, cards.Overview)).toContain(OVERVIEW);
    expect(body(page, cards["Founding story"])).toContain(FOUNDING_STORY);
  });

  // behavioural
  it("Edge case: a very long overview is kept whole, and the other cards still render", async () => {
    const long = business_with_overview(`${"Roasting small lots every single week. ".repeat(120)}The very last sentence of the overview.`);
    const page = await openSection("General Info", { draft: long });
    const cards = cardsOf(page, "General Info");
    const text = body(page, cards.Overview);
    expect(text).toContain("The very last sentence of the overview.");
    expect(text.length).toBeGreaterThan(4000);
    expect(body(page, cards["Founding story"])).toContain(FOUNDING_STORY);
  });

  // behavioural
  it("Edge case: missing year, headcount and legal entity show a visible unknown state, not blanks or 'null'", async () => {
    const b = buildBusiness();
    Object.assign(b.company_foundation, { year_founded: null, employee_count: null, legal_entity_type: null });
    const page = await openSection("General Info", { draft: draftFrom(b) });
    const el = banner(page, "Company", COMPANY_NAME);
    expect(el, "banner").not.toBeNull();
    for (const label of GENERAL_STATS) {
      const group = statGroup(page, el!, label, GENERAL_STATS);
      expect(group, `stat "${label}" is still shown`).not.toBeNull();
      const shown = statValue(page, group!, label);
      expect(shown, `stat "${label}" shows an unknown/empty marker`).not.toBe("");
      expect(shown).not.toMatch(/undefined|null|NaN|\[object/i);
      expect(shown).not.toMatch(/^0$/);
    }
  });

  // behavioural
  it("Edge case: a company name with HTML special characters is rendered as text, never as markup", async () => {
    const name = `Fish & Chips <b>Ltd</b> "Co" <script>alert(1)</script>`;
    const b = buildBusiness();
    b.company_foundation.overview = 'Sells <img src=x onerror=alert(1)> & "quotes".';
    const page = await openSection("General Info", { draft: draftFrom(b, { name }) });
    const el = banner(page, "Company", name);
    expect(el, "banner headed by the literal name").not.toBeNull();
    expect(page.html).not.toContain("<script>alert");
    expect(page.html).not.toContain("<img src=x");
    expect(page.$("b").length + page.$("img").length + page.$("script:contains('alert')").length).toBe(0);
    expect(body(page, cardsOf(page, "General Info").Overview)).toContain('Sells <img src=x onerror=alert(1)> & "quotes".');
  });
});

describe("C3 Customers & Industry", () => {
  // behavioural
  it("has a banner labelled Industry, headed by the industry, with Groupings / Locations / Buyers / Suppliers counts", async () => {
    const page = await openSection("Customers & Industry");
    const el = banner(page, "Industry", cf.industry!);
    expect(el, 'banner with label "Industry" and the industry as heading').not.toBeNull();
    expect(statShows(page, el!, "Groupings", CUSTOMER_STATS, mc.industry_groupings.length)).toBe(true);
    expect(statShows(page, el!, "Locations", CUSTOMER_STATS, cf.service_locations.length)).toBe(true);
    expect(statShows(page, el!, "Buyers", CUSTOMER_STATS, mc.target_buyers.length)).toBe(true);
    expect(statShows(page, el!, "Suppliers", CUSTOMER_STATS, mc.suppliers_and_partners.length)).toBe(true);
  });

  // behavioural
  it("lists the seven cards in order", async () => {
    const page = await openSection("Customers & Industry");
    cardsOf(page, "Customers & Industry");
    expectInOrder(page, titlesOf("Customers & Industry"));
  });

  // behavioural
  it("Business model, Company role and Industry outlook show their values", async () => {
    const page = await openSection("Customers & Industry");
    const cards = cardsOf(page, "Customers & Industry");
    expect(body(page, cards["Business model"])).toContain(cf.business_model);
    const role = body(page, cards["Company role"]);
    for (const r of texts(cf.company_role)) {
      expect(role).toContain(r);
    }
    const outlook = body(page, cards["Industry outlook"]);
    for (const o of mc.industry_outlook) {
      expect(outlook).toContain(o.text);
    }
  });

  // behavioural
  it("Industry groupings, Service locations, Buyers and Suppliers are chip cards with one chip per item", async () => {
    const page = await openSection("Customers & Industry");
    const cards = cardsOf(page, "Customers & Industry");
    expect(separateChips(page, cards["Industry groupings"], texts(mc.industry_groupings))).toBeNull();
    expect(separateChips(page, cards["Service locations"], texts(cf.service_locations))).toBeNull();
    expect(separateChips(page, cards.Buyers, texts(mc.target_buyers))).toBeNull();
    expect(separateChips(page, cards.Suppliers, mc.suppliers_and_partners.map((s) => s.name!))).toBeNull();
  });

  // behavioural
  it("Edge case: counts are the list lengths and follow the data (none / one / many)", async () => {
    const b = buildBusiness();
    b.market_and_customers.industry_groupings = [];
    b.market_and_customers.target_buyers = b.market_and_customers.target_buyers.slice(0, 1);
    b.company_foundation.service_locations = [
      ...b.company_foundation.service_locations,
      ...Array.from({ length: 7 }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000f00${i}${i}`, text: `Region ${i}` })),
    ];
    b.market_and_customers.suppliers_and_partners = [];
    const page = await openSection("Customers & Industry", { draft: draftFrom(b) });
    const el = banner(page, "Industry", b.company_foundation.industry!);
    expect(el).not.toBeNull();
    expect(statShows(page, el!, "Groupings", CUSTOMER_STATS, 0)).toBe(true);
    expect(statShows(page, el!, "Locations", CUSTOMER_STATS, 12)).toBe(true);
    expect(statShows(page, el!, "Buyers", CUSTOMER_STATS, 1)).toBe(true);
    expect(statShows(page, el!, "Suppliers", CUSTOMER_STATS, 0)).toBe(true);
  });

  // behavioural
  it("Edge case: an industry containing HTML special characters is a text heading", async () => {
    const b = buildBusiness();
    b.company_foundation.industry = `R&D <i>labs</i> & "tools"`;
    const page = await openSection("Customers & Industry", { draft: draftFrom(b) });
    expect(banner(page, "Industry", b.company_foundation.industry), "banner headed by the literal industry").not.toBeNull();
    expect(page.$("i").length).toBe(0);
    expect(page.html).not.toContain("<i>labs");
  });
});

describe("C4 Sales & Marketing", () => {
  const PLATFORMS = ["Instagram", "Facebook", "LinkedIn", "TikTok"];
  const HANDLES: Record<string, string> = {
    Instagram: "harborandpinecoffee",
    Facebook: "harborandpinecoffee",
    LinkedIn: "harbor-and-pine-coffee-roasters",
    TikTok: "harborandpine",
  };

  // behavioural
  it("has a banner labelled Sales & Marketing, headed by the company name, with one column per social link", async () => {
    const page = await openSection("Sales & Marketing");
    const el = banner(page, "Sales & Marketing", COMPANY_NAME);
    expect(el, 'banner with label "Sales & Marketing" and the company name').not.toBeNull();
    for (const platform of PLATFORMS) {
      expect(socialColumn(page, el!, platform, HANDLES[platform], PLATFORMS), `${platform} column shows its handle`).toBe(true);
    }
  });

  // behavioural
  it("lists the six cards in order", async () => {
    const page = await openSection("Sales & Marketing");
    cardsOf(page, "Sales & Marketing");
    expectInOrder(page, titlesOf("Sales & Marketing"));
  });

  // behavioural
  it("shows the pitch, personas, needs, channels, calls to action and funnels", async () => {
    const page = await openSection("Sales & Marketing");
    const cards = cardsOf(page, "Sales & Marketing");
    expect(body(page, cards.Pitch)).toContain(business.positioning.company_pitch);
    const persona = body(page, cards["Ideal persona"]);
    for (const p of mc.ideal_customer_personas) {
      expect(persona).toContain(p.name!);
      expect(persona).toContain(p.role!);
    }
    const needs = body(page, cards["Customer needs"]);
    for (const n of texts(mc.customer_needs)) {
      expect(needs).toContain(n);
    }
    const channels = body(page, cards.Channels);
    for (const c of mc.channels) {
      expect(channels).toContain(c.label!);
    }
    const ctas = body(page, cards["Calls to action"]);
    for (const c of mc.ctas) {
      expect(ctas).toContain(c.label);
    }
    const funnels = body(page, cards.Funnels);
    for (const f of mc.funnels) {
      expect(funnels).toContain(f.name!);
      for (const s of f.steps) {
        expect(funnels).toContain(s.label);
      }
    }
  });

  // behavioural
  it("Edge case: zero social links gives a banner with no social columns and no broken text", async () => {
    const b = buildBusiness();
    b.online_presence.social_media_links = [];
    const page = await openSection("Sales & Marketing", { draft: draftFrom(b) });
    const el = banner(page, "Sales & Marketing", COMPANY_NAME);
    expect(el, "banner is still shown").not.toBeNull();
    const text = textOf(page, el!);
    for (const platform of PLATFORMS) {
      expect(text).not.toContain(platform);
    }
    expect(text).not.toMatch(/undefined|null|NaN|\[object/);
    cardsOf(page, "Sales & Marketing");
  });

  // behavioural
  it("Edge case: a long social list shows every link, each in its own column", async () => {
    const b = buildBusiness();
    const extra = ["YouTube", "X", "Pinterest"].map((platform, i) => ({
      id: `00000000-0000-4000-8000-0000000f10${i}0`,
      platform,
      profile_url: `https://example.test/${platform.toLowerCase()}/hp_${i}`,
    }));
    b.online_presence.social_media_links.push(...extra);
    const all = [...PLATFORMS, ...extra.map((e) => e.platform)];
    const page = await openSection("Sales & Marketing", { draft: draftFrom(b) });
    const el = banner(page, "Sales & Marketing", COMPANY_NAME);
    expect(el).not.toBeNull();
    for (const [i, e] of extra.entries()) {
      expect(socialColumn(page, el!, e.platform, `hp_${i}`, all), `${e.platform} column`).toBe(true);
    }
  });
});

describe("C5 values render as text; empty values render an empty state with + Add", () => {
  // behavioural
  it.each(LOCKED_SECTIONS)("%s: closed or read-only, no input, textarea or select holds a knowledge value", async (section) => {
    const page = await openSection(section);
    const cards = cardsOf(page, section);
    for (const [title, el] of Object.entries(cards)) {
      expect(controlsIn(page, el), `card "${title}" contains no form controls`).toEqual([]);
    }
    const valueBearers = page.$("input,textarea").toArray().map((c) => `${page.$(c).attr("value") ?? ""} ${page.$(c).text()}`);
    for (const probe of [OVERVIEW, FOUNDING_STORY, COMPANY_NAME, "212 Wharf Street"]) {
      expect(valueBearers.some((v) => v.includes(probe)), `no control carries "${probe.slice(0, 30)}…"`).toBe(false);
    }
  });

  // behavioural
  it.each(LOCKED_SECTIONS)("%s: a viewer of a company with no entries sees every card with an empty state and a + Add link to the right entry kind", async (section) => {
    const page = await openSection(section, { draft: viewerOf(buildEmptyDraft()) });
    const cards = cardsOf(page, section);
    for (const { title, kind } of CARDS_BY_SECTION[section]) {
      const el = cards[title];
      expect(addLinks(page, el), `card "${title}" has a "+ Add" link`).toEqual([
        `/knowledge?companyId=${EMPTY_COMPANY_ID}&category=${kind}`,
      ]);
      expect(inlineControls(page, el), `card "${title}" has no inline control for a viewer`).toEqual([]);
      expect(controlsIn(page, el)).toEqual([]);
      expect(body(page, el)).not.toMatch(/undefined|null|NaN|\[object/);
    }
  });

  // behavioural (Quest inline-edit-core: an owner's draft fills these cards in place)
  it.each(LOCKED_SECTIONS)("%s: an owner of a company with no entries sees every card with an empty state, an inline control on the editable cards and a + Add link on the others", async (section) => {
    const page = await openSection(section, { draft: buildEmptyDraft() });
    const cards = cardsOf(page, section);
    for (const { title, kind } of CARDS_BY_SECTION[section]) {
      const el = cards[title];
      const control = INLINE_CONTROL[title];
      if (control) {
        expect(inlineControls(page, el), `card "${title}" is filled in place`).toEqual([control]);
        expect(addLinks(page, el), `card "${title}" has no link to the advanced editor`).toEqual([]);
      } else {
        expect(addLinks(page, el), `card "${title}" keeps its "+ Add" link`).toEqual([
          `/knowledge?companyId=${EMPTY_COMPANY_ID}&category=${kind}`,
        ]);
        expect(inlineControls(page, el), `card "${title}" is not editable in place yet`).toEqual([]);
      }
      expect(controlsIn(page, el)).toEqual([]);
      expect(body(page, el)).not.toMatch(/undefined|null|NaN|\[object/);
    }
  });

  // behavioural
  it.each(LOCKED_SECTIONS)("%s: entries that exist but hold blank values get the same empty states (a viewer: + Add links)", async (section) => {
    const page = await openSection(section, { draft: viewerOf(draftFrom(createEmptyBusiness())) });
    const cards = cardsOf(page, section);
    for (const { title, kind } of CARDS_BY_SECTION[section]) {
      expect(addLinks(page, cards[title]), `card "${title}"`).toEqual([
        `/knowledge?companyId=${COMPANY_ID}&category=${kind}`,
      ]);
    }
  });

  // behavioural
  it.each(LOCKED_SECTIONS)("%s: entries that exist but hold blank values get the same empty states (an owner: inline controls where editable)", async (section) => {
    const page = await openSection(section, { draft: draftFrom(createEmptyBusiness()) });
    const cards = cardsOf(page, section);
    for (const { title, kind } of CARDS_BY_SECTION[section]) {
      const control = INLINE_CONTROL[title];
      if (control) {
        expect(inlineControls(page, cards[title]), `card "${title}"`).toEqual([control]);
        expect(addLinks(page, cards[title]), `card "${title}"`).toEqual([]);
      } else {
        expect(addLinks(page, cards[title]), `card "${title}"`).toEqual([
          `/knowledge?companyId=${COMPANY_ID}&category=${kind}`,
        ]);
      }
    }
  });

  // behavioural
  it("the founding story empty state reads 'No founding story yet'", async () => {
    const page = await openSection("General Info", { draft: buildEmptyDraft() });
    expect(body(page, cardsOf(page, "General Info")["Founding story"])).toMatch(/No founding story yet/i);
  });

  // behavioural
  it("Edge case: only the empty card gets the empty state; filled cards keep their value and have no + Add (a viewer: a link; an owner: the inline control)", async () => {
    const b = buildBusiness();
    b.positioning.founding_story = null;
    for (const role of ["viewer", "owner"] as const) {
      const draft = draftFrom(b, { role });
      const page = await openSection("General Info", { draft });
      const cards = cardsOf(page, "General Info");
      expect(body(page, cards["Founding story"])).toMatch(/No founding story yet/i);
      if (role === "viewer") {
        expect(addLinks(page, cards["Founding story"])).toEqual([`/knowledge?companyId=${COMPANY_ID}&category=positioning`]);
        expect(inlineControls(page, cards["Founding story"])).toEqual([]);
      } else {
        expect(addLinks(page, cards["Founding story"])).toEqual([]);
        expect(inlineControls(page, cards["Founding story"])).toEqual(["Edit Founding story"]);
      }
      for (const title of ["Headquarters", "Alternate names", "Overview"]) {
        expect(addLinks(page, cards[title]), `card "${title}"`).toEqual([]);
        expect(norm(body(page, cards[title]))).not.toMatch(/No .* yet/i);
      }
      expect(body(page, cards.Overview)).toContain(OVERVIEW);
    }
  });

  // behavioural
  it("Edge case: a filled draft shows no founding story empty state and no + Add in General Info", async () => {
    const page = await openSection("General Info");
    expect(page.html).not.toMatch(/No founding story yet/i);
    for (const el of Object.values(cardsOf(page, "General Info"))) {
      expect(addLinks(page, el)).toEqual([]);
    }
  });
});

// A copy of the standard draft whose overview is replaced.
function business_with_overview(overview: string) {
  const b = buildBusiness();
  b.company_foundation.overview = overview;
  return draftFrom(b);
}
