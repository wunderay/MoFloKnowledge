// Acceptance, Quest Q7 inline-edit-core, C7: nothing is editable in a saved snapshot, for a viewer, or in an archived company.
//
// There the three sections look and behave as before the inline editors: values are plain text (no button, no
// tab stop, no click handler, no "Click to edit" hint), no text field exists, chip lists have no Add / Remove / Undo
// controls, empty fields keep their "+ Add" link to the advanced editor (/knowledge), and nothing is ever sent.
import { describe, expect, it, vi } from "vitest";
import {
  BUSINESS_MODEL,
  FOUNDING_STORY,
  OVERVIEW,
  PITCH,
  SNAPSHOT_ID,
  VERSIONS,
  buildBusiness,
  buildEmptyDraft,
  buildDraft,
  snapshotFrom,
} from "../helpers/knowledge-view-fixtures";
import {
  CHIP_FIELDS,
  addInputs,
  addPill,
  draftWith,
  isInteractive,
  isPlainText,
  nothingSent,
  open,
  removeButtons,
  typable,
  undoButtons,
  itemsOf,
  stored,
} from "../helpers/knowledge-view-inline-edit";
import type { OpenOptions, SectionLabel, View } from "../helpers/knowledge-view-site-all-runtime";

vi.setConfig({ testTimeout: 60_000 });

const snapshot = (): OpenOptions => ({ snapshot: { payload: snapshotFrom(buildDraft()), versionId: SNAPSHOT_ID }, versions: VERSIONS });
const viewer = (): OpenOptions => ({ draft: draftWith(() => {}, { role: "viewer" }) });
const archived = (): OpenOptions => {
  const draft = buildDraft();
  draft.company = { ...draft.company, archived_at: "2026-10-14T08:00:00.000Z" };
  return { draft };
};
const STATES: [string, () => OpenOptions][] = [
  ["a saved snapshot", snapshot],
  ["a viewer's draft", viewer],
  ["an archived company's draft", archived],
];
const SECTIONS: { section: SectionLabel; values: string[] }[] = [
  { section: "General Info", values: [OVERVIEW, FOUNDING_STORY, "Limited Liability Company (LLC)", "H&P Coffee"] },
  { section: "Customers & Industry", values: [BUSINESS_MODEL, "Specialty coffee roasting and retail", "Maine", "Coffee roaster"] },
  { section: "Sales & Marketing", values: [PITCH, "Freshly roasted coffee with clear origin and roast-date information"] },
  { section: "All sections", values: [OVERVIEW, BUSINESS_MODEL, PITCH] },
];

function expectNoEditing(view: View) {
  expect(view.byRole("button", /^edit /i), "no 'Edit …' button").toHaveLength(0);
  expect(view.all().filter((n) => n.props.title === "Click to edit"), "no 'Click to edit' hint").toHaveLength(0);
  expect(typable(view), "no text field of any kind").toHaveLength(0);
  expect(view.all().filter((n) => n.tag === "textarea" || (n.tag === "input" && !["hidden", "checkbox", "radio"].includes(String(n.props.type ?? "text")))), "no input or textarea element").toEqual([]);
  expect(view.byRole("button", /^remove /i), "no Remove control").toHaveLength(0);
  expect(undoButtons(view), "no Undo").toHaveLength(0);
  for (const field of CHIP_FIELDS) {
    expect(addPill(view, field), `no "Add ${field.noun}" button`).toHaveLength(0);
    expect(addInputs(view, field)).toHaveLength(0);
  }
  nothingSent(view);
}

describe.each(STATES)("C7 read-only: %s", (_name, options) => {
  describe.each(SECTIONS)("$section", ({ section, values }) => {
    it("has no editing controls and shows every value as plain text", async () => {
      const owner = await open(section);
      expect(owner.byRole("button", /^edit /i).length, "an owner's draft of this section is editable (the contrast this test is about)").toBeGreaterThan(0);
      const view = await open(section, options());
      expectNoEditing(view);
      for (const value of values) expect(isPlainText(view, value), `"${value.slice(0, 40)}…" is plain text`).toBe(true);
    });

    it("clicking a value or pressing keys on it changes nothing and sends nothing", async () => {
      const owner = await open(section);
      expect(owner.byRole("button", /^edit /i).length, "an owner's draft of this section is editable").toBeGreaterThan(0);
      const view = await open(section, options());
      for (const value of values) {
        const holder = view.all().find((n) => n.children.some((c) => typeof c === "string" && c.includes(value)));
        expect(holder, value.slice(0, 30)).toBeDefined();
        if (holder) {
          expect(isInteractive(holder)).toBe(false);
          await view.click(holder);
        }
      }
      await view.settle();
      expectNoEditing(view);
    });
  });
});

describe("C7 read-only views keep the links to the advanced editor", () => {
  it("a viewer of a company without entries still sees '+ Add' links to /knowledge, and no editor", async () => {
    const draft = buildEmptyDraft();
    draft.company = { ...draft.company, role: "viewer" };
    for (const section of ["General Info", "Customers & Industry", "Sales & Marketing"] as SectionLabel[]) {
      const ownerDraft = buildEmptyDraft();
      const owner = await open(section, { draft: ownerDraft });
      expect(owner.byRole("button", /^(edit|add) /i).length, `an owner can fill ${section} in place (the contrast)`).toBeGreaterThan(0);
      const view = await open(section, { draft });
      expectNoEditing(view);
      const adds = view.byRole("link", /^\+ add$/i);
      expect(adds.length, `"+ Add" links in ${section}`).toBeGreaterThan(0);
      for (const link of adds) expect(String(link.props.href)).toMatch(/^\/knowledge\?companyId=[^&]+&category=/);
    }
  });

  it("a saved snapshot keeps its chip lists as lists with an 'Add' link to the advanced editor", async () => {
    const owner = await open("Customers & Industry");
    expect(addPill(owner, CHIP_FIELDS.find((f) => f.id === "buyers")!), "an owner's draft has an Add button instead (the contrast)").toHaveLength(1);
    const view = await open("Customers & Industry", snapshot());
    expect(view.byRole("link", /^add buyer$/i)).toHaveLength(1);
    const items = itemsOf(stored(await open("Customers & Industry"), "market_and_customers"), ["target_buyers"]);
    for (const item of items) expect(removeButtons(view, item.text)).toHaveLength(0);
  });

  it("the banner counters read '<n> <noun>' in a snapshot too", async () => {
    const view = await open("Customers & Industry", snapshot());
    const business = buildBusiness();
    const text = view.text();
    expect(text).toMatch(new RegExp(`(^|\\D)${business.market_and_customers.target_buyers.length} Buyers`));
    expect(text).toMatch(new RegExp(`(^|\\D)${business.company_foundation.service_locations.length} Locations`));
  });
});
