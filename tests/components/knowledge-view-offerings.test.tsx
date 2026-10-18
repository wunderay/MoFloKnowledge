// Acceptance: the Business Offerings section of /knowledge/view
// (Quest knowledge-view-offerings-brand, criteria C1, C2, C3, C6, C7, C8 for offerings).
// Assertions use headings, labels, displayed values, accessible names, aria state and
// link hrefs only; none depends on class names or markup depth.
import { describe, expect, it } from "vitest";
import {
  COMPANY_ID,
  COMPANY_NAME,
  EMPTY_COMPANY_ID,
  buildEmptyDraft,
  draftFrom,
} from "../helpers/knowledge-view-fixtures";
import { headings, norm, parse, selectorItems, textOf, type Page } from "../helpers/knowledge-view-dom";
import {
  addLinksOf,
  commonAncestor,
  countBadge,
  groupValue,
  isSelectedRow,
  labelGroup,
  listRows,
  offeringsList,
  triggers,
} from "../helpers/knowledge-view-offerings-brand-dom";
import { openOfferings, renderOB, sectionIdOf } from "../helpers/knowledge-view-offerings-brand-render";
import {
  HOSTILE,
  OFFERINGS,
  OFFERING_IDS,
  SECOND_OFFERING_FEATURES,
  evidenceFixture,
  noOfferingsDraft,
  offeringAddHref,
  offeringsBusiness,
  offeringsDraft,
  offeringsSnapshot,
} from "../helpers/knowledge-view-offerings-brand-fixtures";

type Element = NonNullable<ReturnType<typeof offeringsList>>;
const DETAIL = ["Offering", "Type", "Description", "Key features", "Cost", "Pricing model"] as const;
type Label = (typeof DETAIL)[number];
const BAD = /undefined|null|NaN|\[object/;
const ADD = offeringAddHref(COMPANY_ID);
const [SUB, WHOLESALE, WORKSHOP, GIFT] = OFFERINGS;

/** The six detail groups of the selected offering. */
function detail(page: Page): Record<Label, Element> {
  const out = {} as Record<Label, Element>;
  for (const label of DETAIL) {
    const group = labelGroup(page, label, [...DETAIL]);
    expect(group, `the detail shows a "${label}" card/label`).not.toBeNull();
    out[label] = group!;
  }
  expect(new Set(Object.values(out)).size, "each label heads its own card").toBe(DETAIL.length);
  return out;
}
const shown = (page: Page, d: Record<Label, Element>, label: Label) => groupValue(page, d[label], label);

function list(page: Page) {
  const el = offeringsList(page);
  expect(el, 'a list/navigation with the accessible name "Business offerings"').not.toBeNull();
  return { el: el!, rows: listRows(page, el!) };
}
const selectedIndexes = (page: Page) => {
  const { el, rows } = list(page);
  void el;
  return rows.map((r, i) => (isSelectedRow(page, r) ? i : -1)).filter((i) => i >= 0);
};
const addOfferingLinks = (page: Page) =>
  page.$("a[href]").toArray().filter((a) => {
    const text = norm(page.$(a).text());
    const name = norm(page.$(a).attr("aria-label") ?? "");
    return /^\+?\s*add offering$/i.test(text) || /^add offering$/i.test(name);
  }).map((a) => page.$(a).attr("href"));

describe("fixtures", () => {
  // guard
  it("there are four offerings; the fourth is unnamed, and ids are unique entry ids", () => {
    expect(OFFERINGS).toHaveLength(4);
    expect(GIFT.name).toBeNull();
    expect(new Set(OFFERING_IDS).size).toBe(4);
  });
});

describe("C1 Business Offerings heading, count, add link and list", () => {
  // behavioural
  it("shows a Business Offerings heading with a count badge equal to the number of offerings", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    const badge = countBadge(page, "Business Offerings", offeringsList(page));
    expect(badge.heading, 'a heading "Business Offerings"').toBe(true);
    expect(badge.count).toBe(4);
  });

  // behavioural
  it("has an Add offering link to the offering editor", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    expect(addOfferingLinks(page)).toEqual([ADD]);
  });

  // behavioural
  it("lists every offering in order, each with its name and its type as a subtitle", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    const { rows } = list(page);
    expect(rows).toHaveLength(4);
    const texts = rows.map((r) => textOf(page, r));
    for (const [i, o] of [SUB, WHOLESALE, WORKSHOP].entries()) {
      expect(texts[i], `row ${i + 1} shows the name`).toContain(o.name);
      expect(texts[i], `row ${i + 1} shows the type`).toContain(o.offering_type);
      const afterName = texts[i].slice(texts[i].indexOf(o.name!) + o.name!.length);
      expect(afterName, "the type follows the name").toContain(o.offering_type);
    }
  });

  // behavioural
  it("Edge case: an offering without a name is listed as 'Untitled offering N' (its position), with no 'null' for the missing type", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    const { rows } = list(page);
    expect(textOf(page, rows[3])).toContain("Untitled offering 4");
    for (const r of rows) {
      expect(textOf(page, r)).not.toMatch(BAD);
    }
    expect(textOf(page, rows[0])).not.toContain("Untitled offering");
  });

  // behavioural
  it("selects the first offering by default, and only that one", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    expect(selectedIndexes(page)).toEqual([0]);
    expect(shown(page, detail(page), "Offering")).toContain(SUB.name);
  });

  // behavioural
  it.each([1, 2, 3])("the offering URL parameter selects offering %i, and only that one", async (index) => {
    const page = await openOfferings({ draft: offeringsDraft(), offering: OFFERING_IDS[index] });
    expect(selectedIndexes(page)).toEqual([index]);
    expect(shown(page, detail(page), "Description")).toContain(OFFERINGS[index].description);
  });

  // behavioural
  it.each(["00000000-0000-4000-8000-00000ffdead0", "not-an-id", "", "<script>alert(1)</script>"])(
    "Edge case: an unknown offering parameter (%j) falls back to the first offering",
    async (offering) => {
      const page = await openOfferings({ draft: offeringsDraft(), offering });
      expect(selectedIndexes(page)).toEqual([0]);
      expect(shown(page, detail(page), "Offering")).toContain(SUB.name);
      expect(page.html).not.toContain("<script>alert(1)");
    },
  );

  // behavioural
  it("Edge case: one offering is listed, selected and counted as 1", async () => {
    const page = await openOfferings({ draft: offeringsDraft([SUB]) });
    expect(list(page).rows).toHaveLength(1);
    expect(selectedIndexes(page)).toEqual([0]);
    expect(countBadge(page, "Business Offerings", offeringsList(page)).count).toBe(1);
  });

  // behavioural
  it("Edge case: fourteen offerings are all listed, counted as 14, and the last can be selected", async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...SUB,
      id: `00000000-0000-4000-8000-00000ff${(0x700 + i).toString(16).padStart(5, "0")}`,
      name: `Roast plan ${String.fromCharCode(65 + i)}`,
      description: `Description of plan ${String.fromCharCode(65 + i)}.`,
      features: [],
    }));
    const page = await openOfferings({ draft: offeringsDraft(many), offering: many[13].id });
    const { rows } = list(page);
    expect(rows).toHaveLength(14);
    many.forEach((o, i) => expect(textOf(page, rows[i])).toContain(o.name));
    expect(countBadge(page, "Business Offerings", offeringsList(page)).count).toBe(14);
    expect(selectedIndexes(page)).toEqual([13]);
    expect(shown(page, detail(page), "Description")).toContain("Description of plan N.");
  });

  // behavioural
  it("Edge case: a very long offering name is kept whole in the list and in the detail", async () => {
    const name = `${"Extraordinarily long offering name ".repeat(12)}ends here`;
    const b = offeringsBusiness();
    b.offerings[0].name = name;
    const page = await openOfferings({ draft: draftFrom(b) });
    expect(textOf(page, list(page).rows[0])).toContain(name);
    expect(shown(page, detail(page), "Offering")).toContain(name);
  });

  // behavioural
  it("Edge case: special characters in an offering name are text, never markup", async () => {
    const name = `Tea & <i>Toast</i> "Box" <img src=x onerror=alert(1)>`;
    const b = offeringsBusiness();
    b.offerings[0].name = name;
    const page = await openOfferings({ draft: draftFrom(b) });
    expect(textOf(page, list(page).rows[0])).toContain(name);
    expect(page.$("i").length + page.$("img").length).toBe(0);
    expect(page.html).not.toContain("<img src=x");
  });
});

describe("C2 offering detail", () => {
  // behavioural
  it("the first offering fills Offering, Type, Description, Key features, Cost and Pricing model", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    const d = detail(page);
    expect(shown(page, d, "Offering")).toContain(SUB.name);
    expect(shown(page, d, "Type")).toContain("Subscription");
    expect(shown(page, d, "Description")).toContain(SUB.description);
    for (const f of SUB.features) {
      expect(shown(page, d, "Key features")).toContain(f.text);
    }
    expect(shown(page, d, "Cost")).toContain("$18 per bag, billed monthly");
    expect(shown(page, d, "Pricing model")).toContain("Recurring subscription");
  });

  // behavioural
  it("a filled offering has no empty state or + Add in its detail", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    const d = detail(page);
    for (const label of DETAIL) {
      expect(addLinksOf(page, d[label]), `card "${label}"`).toEqual([]);
      expect(shown(page, d, label)).not.toMatch(BAD);
    }
  });

  // behavioural
  it("the detail shows only the selected offering's values", async () => {
    const page = await openOfferings({ draft: offeringsDraft(), offering: OFFERING_IDS[1] });
    const d = detail(page);
    expect(shown(page, d, "Offering")).toContain(WHOLESALE.name);
    expect(shown(page, d, "Type")).toContain("Wholesale");
    expect(shown(page, d, "Description")).toContain(WHOLESALE.description);
    for (const f of SECOND_OFFERING_FEATURES) {
      expect(shown(page, d, "Key features")).toContain(f);
    }
    expect(shown(page, d, "Cost")).toContain("Contact us for wholesale pricing");
    expect(shown(page, d, "Pricing model")).toContain("Volume-tiered quote");
    const all = DETAIL.map((l) => shown(page, d, l)).join(" ");
    for (const other of [SUB.name, SUB.description, "Roasted to order", "$18 per bag", "Recurring subscription"]) {
      expect(all, `nothing of the first offering ("${other}") leaks into the detail`).not.toContain(other);
    }
  });

  // behavioural
  it("a free offering shows its pricing wording as Cost; missing features and pricing model get empty states", async () => {
    const page = await openOfferings({ draft: offeringsDraft(), offering: OFFERING_IDS[2] });
    const d = detail(page);
    expect(shown(page, d, "Cost")).toContain("Free for subscribers");
    expect(addLinksOf(page, d["Key features"])).toEqual([`${ADD}&entryId=${OFFERING_IDS[2]}`]);
    expect(addLinksOf(page, d["Pricing model"])).toEqual([`${ADD}&entryId=${OFFERING_IDS[2]}`]);
    for (const label of ["Offering", "Type", "Description", "Cost"] as const) {
      expect(addLinksOf(page, d[label]), `card "${label}" is filled`).toEqual([]);
    }
  });

  // behavioural
  it("Edge case: an offering with null pricing, no features, no name and no type shows empty states with + Add to the offering editor", async () => {
    const page = await openOfferings({ draft: offeringsDraft(), offering: OFFERING_IDS[3] });
    const d = detail(page);
    for (const label of ["Type", "Key features", "Cost", "Pricing model"] as const) {
      expect(addLinksOf(page, d[label]), `card "${label}"`).toEqual([`${ADD}&entryId=${OFFERING_IDS[3]}`]);
    }
    expect(shown(page, d, "Description")).toContain(GIFT.description);
    expect(addLinksOf(page, d.Description)).toEqual([]);
    // The name is missing: the card says so (fallback name or empty state) rather than printing nothing or 'null'.
    const name = shown(page, d, "Offering");
    expect(name).not.toMatch(BAD);
    expect(name.includes('Untitled offering 4') || addLinksOf(page, d.Offering).length === 1, "unnamed offering").toBe(true);
    for (const label of DETAIL) {
      expect(shown(page, d, label)).not.toMatch(BAD);
    }
  });

  // behavioural
  it("shows no offering image and no Delete action", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    expect(page.$("img").length, "no images in the offerings view").toBe(0);
    const actions = page.$("a,button,input[type=submit],input[type=button]").toArray()
      .map((el) => `${norm(page.$(el).text())} ${page.$(el).attr("aria-label") ?? ""} ${page.$(el).attr("value") ?? ""}`);
    expect(actions.filter((a) => /delete/i.test(a))).toEqual([]);
    // positive anchor so this cannot pass on a page without the section
    expect(shown(page, detail(page), "Offering")).toContain(SUB.name);
  });

  // behavioural
  it("values are text: no form control sits in the detail", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    const d = detail(page);
    for (const label of DETAIL) {
      expect(page.$(d[label]).find("input,textarea,select").length, `card "${label}"`).toBe(0);
    }
  });

  // behavioural
  it("Edge case: a very long description and many features are kept whole", async () => {
    const description = `${"Small-lot coffee roasted every single week. ".repeat(100)}The very last sentence.`;
    const b = offeringsBusiness();
    b.offerings[0].description = description;
    b.offerings[0].features = Array.from({ length: 12 }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000ff${(0x800 + i).toString(16).padStart(5, "0")}`,
      text: `Feature number ${String.fromCharCode(65 + i)}`,
    }));
    const page = await openOfferings({ draft: draftFrom(b) });
    const d = detail(page);
    expect(shown(page, d, "Description")).toContain("The very last sentence.");
    expect(shown(page, d, "Description").length).toBeGreaterThan(4000);
    for (const f of b.offerings[0].features) {
      expect(shown(page, d, "Key features")).toContain(f.text);
    }
  });

  // behavioural (defensive: these pricing objects break PricingSchema, which requires `raw`)
  it("Edge case: without pricing wording, Cost shows amount, currency and billing interval", async () => {
    const b = offeringsBusiness();
    Object.assign(b.offerings[0].pricing!, { raw: "", amount: "12.50", currency: "EUR", billing_interval: "year" });
    const page = await openOfferings({ draft: draftFrom(b) });
    const cost = shown(page, detail(page), "Cost");
    expect(cost).toContain("12.50");
    expect(cost).toContain("EUR");
    expect(cost).toContain("year");
  });

  // behavioural (defensive, as above)
  it.each([
    ["contact_for_pricing", /contact/i],
    ["free", /free/i],
  ] as const)("Edge case: a %s price without wording is shown as such", async (kind, expected) => {
    const b = offeringsBusiness();
    Object.assign(b.offerings[0].pricing!, { raw: "", kind, amount: null, currency: null, billing_interval: null });
    const page = await openOfferings({ draft: draftFrom(b) });
    expect(shown(page, detail(page), "Cost")).toMatch(expected);
  });

  // behavioural (defensive, as above)
  it("Edge case: an unknown price (no wording, no amount) is an empty state", async () => {
    const b = offeringsBusiness();
    Object.assign(b.offerings[0].pricing!, { raw: "", kind: "paid", amount: null, currency: null, billing_interval: null });
    const page = await openOfferings({ draft: draftFrom(b) });
    const d = detail(page);
    expect(addLinksOf(page, d.Cost)).toEqual([`${ADD}&entryId=${OFFERING_IDS[0]}`]);
    expect(shown(page, d, "Cost")).not.toMatch(BAD);
  });
});

describe("C3 no offerings", () => {
  // behavioural
  it.each([
    ["a company whose entries hold no offering", noOfferingsDraft(), COMPANY_ID],
    ["a company with no entries at all", buildEmptyDraft(), EMPTY_COMPANY_ID],
  ] as const)("%s: shows 'No offerings yet' with + Add to the offering editor, and a 0 badge", async (_n, draft, companyId) => {
    const page = await openOfferings({ draft });
    expect(norm(page.$("body").text())).toMatch(/No offerings yet/i);
    const addHrefs = page.$("a[href]").toArray()
      .filter((a) => norm(page.$(a).text()) === "+ Add")
      .map((a) => page.$(a).attr("href"));
    expect(addHrefs).toContain(offeringAddHref(companyId));
    expect(countBadge(page, "Business Offerings", offeringsList(page)).count).toBe(0);
    expect(page.html).not.toContain("Untitled offering");
    expect(norm(page.$("body").text())).not.toMatch(BAD);
  });

  // behavioural
  it("Edge case: an offering parameter on a company without offerings changes nothing", async () => {
    const page = await openOfferings({ draft: noOfferingsDraft(), offering: OFFERING_IDS[1] });
    expect(norm(page.$("body").text())).toMatch(/No offerings yet/i);
    expect(countBadge(page, "Business Offerings", offeringsList(page)).count).toBe(0);
  });
});

describe("C6 security", () => {
  // behavioural (defensive: a javascript: offering url breaks OfferingSchema's URL rule)
  it("Edge case: no link on the page uses a javascript:, data: or vbscript: URL", async () => {
    const b = offeringsBusiness();
    b.offerings[0].url = HOSTILE.jsLogo;
    b.offerings[1].url = HOSTILE.dataLogo;
    const page = await openOfferings({ draft: draftFrom(b) });
    for (const a of page.$("[href],[src],[action],[formaction]").toArray()) {
      for (const attr of ["href", "src", "action", "formaction"]) {
        expect(page.$(a).attr(attr) ?? "", `${attr} of <${(a as Element & { name: string }).name}>`).not.toMatch(/^\s*(javascript|data|vbscript):/i);
      }
    }
    expect(shown(page, detail(page), "Offering")).toContain(SUB.name);
  });

  // behavioural
  it("links the page offers are http(s) or in-app paths", async () => {
    const page = await openOfferings({ draft: offeringsDraft() });
    for (const a of page.$("a[href]").toArray()) {
      const href = page.$(a).attr("href")!;
      expect(/^(https?:\/\/|\/|#|\?)/i.test(href), `href ${href}`).toBe(true);
    }
    expect(addOfferingLinks(page)).toEqual([ADD]);
  });
});

describe("C7 draft, saved snapshot and evidence", () => {
  const DRAFT_ONLY = /Edit draft|View draft|History|Remove from future versions/g;
  /** The section's output: the container of the heading, the list and the detail. */
  function region(page: Page): string {
    const head = headings(page).find((h) => /^Business Offerings\b/i.test(h.text))!;
    const cost = labelGroup(page, "Cost", [...DETAIL])!;
    expect(head, "section heading").toBeDefined();
    const el = commonAncestor(head.el, cost)!;
    return textOf(page, el).replace(DRAFT_ONLY, "").replace(/\s+/g, " ").trim();
  }

  // behavioural
  it.each([undefined, OFFERING_IDS[1], OFFERING_IDS[3]])("a saved snapshot renders the same section output as its draft (offering=%s)", async (offering) => {
    const draft = offeringsDraft();
    const fromDraft = region(await openOfferings({ draft, offering }));
    const fromSnapshot = region(await openOfferings({ snapshot: offeringsSnapshot(draft), offering }));
    expect(fromDraft).toContain(offering ? OFFERINGS[OFFERING_IDS.indexOf(offering as never)].description! : SUB.name!);
    expect(fromSnapshot).toEqual(fromDraft);
  });

  describe.each(["draft", "snapshot"] as const)("evidence (%s)", (source) => {
    // behavioural (presence only)
    it("every detail card with claims keeps a Sources control", async () => {
      const fx = evidenceFixture();
      const page = await openOfferings(source === "draft" ? { draft: fx.draft } : { snapshot: fx.snapshot() });
      const d = detail(page);
      for (const label of DETAIL) {
        expect(triggers(page, d[label]).some((t) => t.startsWith("Sources")), `card "${label}" has a Sources control`).toBe(true);
      }
    });
  });
});

describe("C8 non-regression", () => {
  // non-regression (the Q2 sections themselves are covered by tests/components/knowledge-view-*.test.tsx)
  it("an offering parameter does not disturb General Info", async () => {
    const generalId = selectorItems(parse(await renderOB({ draft: offeringsDraft() }))).find((i) => i.label === "General Info")!.value;
    const page = parse(await renderOB({ draft: offeringsDraft(), section: generalId, offering: OFFERING_IDS[1] }));
    expect(headings(page).map((h) => h.text)).toEqual(expect.arrayContaining(["Headquarters", "Overview", COMPANY_NAME]));
    expect(headings(page).some((h) => /^Business Offerings\b/i.test(h.text))).toBe(false);
    expect(await sectionIdOf("Business Offerings")).not.toBe("");
  });
});
