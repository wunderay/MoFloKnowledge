// Acceptance: the "Knowledge section" selector of /knowledge/view (Quest
// knowledge-view-shell, criteria C1 and C8). Rendered through the real server
// page with fixture data; assertions use accessible names, option text/order,
// selected state and headings only.
import { describe, expect, it } from "vitest";
import { renderViewPage } from "../helpers/knowledge-view-render";
import {
  buildDraft,
  buildEmptyDraft,
  snapshotFrom,
  SNAPSHOT_ID,
  VERSIONS,
} from "../helpers/knowledge-view-fixtures";
import {
  hasHeading,
  parse,
  sectionSelector,
  selectedSection,
  selectorItems,
} from "../helpers/knowledge-view-dom";
import {
  LATER_SECTIONS,
  SECTIONS,
  openSection,
  sectionId,
} from "../helpers/knowledge-view-spec";

const draftPage = async (section?: string) =>
  parse(await renderViewPage({ draft: buildDraft(), versions: VERSIONS, section }));

describe("C1 section selector", () => {
  // behavioural
  it("exposes a control named 'Knowledge section' listing the seven sections in order", async () => {
    const page = await draftPage();
    expect(sectionSelector(page), 'a control with accessible name "Knowledge section"').not.toBeNull();
    expect(selectorItems(page).map((i) => i.label)).toEqual([...SECTIONS]);
  });

  // behavioural
  it("selects General Info by default (no section parameter)", async () => {
    const page = await draftPage();
    expect(selectedSection(page)).toEqual(["General Info"]);
  });

  // behavioural
  it("gives every section its own non-empty URL identifier", async () => {
    const items = selectorItems(await draftPage());
    expect(items).toHaveLength(SECTIONS.length);
    const values = items.map((i) => i.value);
    expect(values.every((v) => v !== "")).toBe(true);
    expect(new Set(values).size).toBe(SECTIONS.length);
  });

  // behavioural
  it.each(SECTIONS)("the section parameter for %s selects exactly that section", async (label) => {
    const id = await sectionId(label);
    const page = await draftPage(id);
    expect(selectedSection(page)).toEqual([label]);
  });

  // behavioural
  it("shows only the General Info cards by default, and only the chosen section's cards otherwise", async () => {
    const general = await draftPage();
    expect(hasHeading(general, "Founding story")).toBe(true);
    expect(hasHeading(general, "Business model")).toBe(false);
    expect(hasHeading(general, "Calls to action")).toBe(false);

    const customers = await openSection("Customers & Industry");
    expect(hasHeading(customers, "Business model")).toBe(true);
    expect(hasHeading(customers, "Founding story")).toBe(false);
    expect(hasHeading(customers, "Calls to action")).toBe(false);

    const sales = await openSection("Sales & Marketing");
    expect(hasHeading(sales, "Calls to action")).toBe(true);
    expect(hasHeading(sales, "Founding story")).toBe(false);
    expect(hasHeading(sales, "Business model")).toBe(false);
  });

  // behavioural
  it.each(["not-a-section", "GENERAL", "", "__proto__", "0"])(
    "Edge case: unknown section value %j falls back to General Info",
    async (value) => {
      const page = await draftPage(value);
      expect(selectedSection(page)).toEqual(["General Info"]);
      expect(hasHeading(page, "Founding story")).toBe(true);
      expect(hasHeading(page, "Business model")).toBe(false);
    },
  );

  // behavioural
  it("Edge case: the selector is also present for a saved snapshot, defaulting to General Info", async () => {
    const draft = buildDraft();
    const page = parse(
      await renderViewPage({
        snapshot: { payload: snapshotFrom(draft), versionId: SNAPSHOT_ID },
        versions: VERSIONS,
      }),
    );
    expect(selectorItems(page).map((i) => i.label)).toEqual([...SECTIONS]);
    expect(selectedSection(page)).toEqual(["General Info"]);
  });

  // behavioural
  it("Edge case: the selector is present for a company with no knowledge at all", async () => {
    const page = parse(await renderViewPage({ draft: buildEmptyDraft(), versions: [] }));
    expect(selectorItems(page).map((i) => i.label)).toEqual([...SECTIONS]);
    expect(selectedSection(page)).toEqual(["General Info"]);
    expect(hasHeading(page, "Founding story")).toBe(true);
  });
});

describe("C8 sections built in later Quests", () => {
  // behavioural (only the selection and a clean render are locked; content is not)
  it.each(LATER_SECTIONS)("%s can be selected and renders without an error page", async (label) => {
    const page = await openSection(label);
    expect(selectedSection(page)).toEqual([label]);
    expect(page.html).not.toContain("knowledge is unavailable");
    expect(page.$("h1").toArray().map((h) => page.$(h).text())).toContain("Harbor & Pine Coffee Roasters");
  });

  // behavioural
  // Revised by Q4: All sections now shows every section's cards (Q4 C5), so it is excluded here.
  it.each(LATER_SECTIONS.filter((label) => label !== "All sections"))("Edge case: %s does not show the locked sections' cards as its own", async (label) => {
    const page = await openSection(label);
    expect(hasHeading(page, "Founding story")).toBe(false);
    expect(hasHeading(page, "Calls to action")).toBe(false);
  });
});
