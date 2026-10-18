// Business Offerings: evidence per list item and per field, readable control names,
// coverage reasons and a keyboard-operable list. Draft and saved snapshot, through
// the real server page. Queries use accessible names, visible text and aria state.
import { describe, expect, it } from "vitest";
import { norm, textOf, type Page } from "../helpers/knowledge-view-dom";
import { labelGroup, listRows, offeringsList } from "../helpers/knowledge-view-offerings-brand-dom";
import { openOfferings } from "../helpers/knowledge-view-offerings-brand-render";
import { OFFERINGS, OFFERING_IDS } from "../helpers/knowledge-view-offerings-brand-fixtures";
import { REASONS, buildObEvidence, type ObEvidenceOptions } from "../helpers/knowledge-view-offerings-brand-evidence";

const DETAIL = ["Offering", "Type", "Description", "Key features", "Cost", "Pricing model"];
const [SUB, WHOLESALE] = OFFERINGS;
const open = {
  draft: (offering?: string, opts: ObEvidenceOptions = {}) => openOfferings({ draft: buildObEvidence(opts).draft, offering }),
  snapshot: (offering?: string, opts: ObEvidenceOptions = {}) => openOfferings({ snapshot: buildObEvidence(opts).snapshot(), offering }),
};
/** Every evidence control of the section: its accessible name and what it shows. */
const controls = (page: Page) =>
  page.$(".knowledge-view__panel button.citation-popover__trigger").toArray().map((b) => ({
    name: page.$(b).attr("aria-label") ?? "",
    shown: norm(page.$(b).text()),
  }));
const group = (page: Page, label: string) => labelGroup(page, label, DETAIL)!;
const groupText = (page: Page, label: string) => textOf(page, group(page, label));
const rows = (page: Page) => listRows(page, offeringsList(page)!);

describe.each(["draft", "snapshot"] as const)("offerings evidence (%s)", (source) => {
  // behavioural
  it("each listed offering whose own claims are non-source carries a marker named by its name", async () => {
    const page = await open[source]();
    const markers = rows(page).map((row) =>
      page.$(row).find("button.citation-popover__trigger").toArray().map((b) => ({
        name: page.$(b).attr("aria-label"),
        shown: norm(page.$(b).text()),
      })),
    );
    expect(markers).toEqual([
      [{ name: `User correction: evidence for ${SUB.name}`, shown: "User correction ⓘ" }],
      [{ name: `Historical inferred: evidence for ${WHOLESALE.name}`, shown: "Historical inferred ⓘ" }],
      [],
      [],
    ]);
  });

  // behavioural
  it("the user-corrected feature has its own marker, named by the feature text; the others have none", async () => {
    const page = await open[source]();
    const items = page.$(group(page, "Key features")).find("li").toArray();
    expect(items).toHaveLength(SUB.features.length);
    const marked = items.map((li) => page.$(li).find("button.citation-popover__trigger").toArray().map((b) => page.$(b).attr("aria-label")));
    expect(marked).toEqual([[], [`User correction: evidence for ${SUB.features[1].text}`], []]);
  });

  // behavioural
  it("a historical inference on the description of a selected offering is named in its card", async () => {
    const page = await open[source](OFFERING_IDS[1]);
    const names = controls(page).map((c) => c.name);
    expect(names).toContain(`Historical inferred: evidence for description of ${WHOLESALE.name}`);
    expect(norm(page.$(group(page, "Description")).find("button.citation-popover__trigger").first().text())).toBe("Historical inferred ⓘ");
  });

  // behavioural
  it.each([undefined, OFFERING_IDS[1], OFFERING_IDS[3]])("no evidence control is named by a raw id or path (offering=%s)", async (offering) => {
    const page = await open[source](offering);
    const all = controls(page);
    expect(all.length).toBeGreaterThan(5);
    for (const { name } of all) {
      expect(name).not.toContain("@");
      expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(name).not.toMatch(/\//);
    }
  });

  // behavioural
  it("every detail card's control names its field and the offering", async () => {
    const page = await open[source]();
    const nouns = { Offering: "name", Type: "type", Description: "description", "Key features": "key features", Cost: "cost", "Pricing model": "pricing model" };
    for (const label of DETAIL) {
      const own = page.$(group(page, label)).find(".knowledge-view__mini-label button.citation-popover__trigger").toArray().map((b) => page.$(b).attr("aria-label"));
      expect(own, `card "${label}"`).toHaveLength(1);
      expect(own[0]).toMatch(new RegExp(`: evidence for ${nouns[label as keyof typeof nouns]} of ${SUB.name}$`));
    }
  });

  // behavioural
  it("empty or not-found fields print their coverage reason; found values print none", async () => {
    const page = await open[source](OFFERING_IDS[3]);
    expect(groupText(page, "Cost")).toContain(`Not found in checked pages — ${REASONS.noPricing}`);
    expect(groupText(page, "Pricing model")).toContain(`Not found in checked pages — ${REASONS.noPricing}`);
    expect(groupText(page, "Key features")).toContain(`Partial — ${REASONS.noFeatures}`);
    expect(groupText(page, "Type")).toContain(`Unknown · Not assessed — ${REASONS.noType}`);
    expect(groupText(page, "Offering")).toContain("Unknown · Not assessed — No assessment is recorded for this field.");
    // the description is filled and has no assessment: no note
    expect(groupText(page, "Description")).not.toMatch(/Unknown|Partial|Conflicting|Not found/);
  });

  // behavioural
  it("a filled field that is only partly found prints its reason next to the value", async () => {
    const page = await open[source]();
    expect(groupText(page, "Description")).toContain(SUB.description!);
    expect(groupText(page, "Description")).toContain(`Partial — ${REASONS.description}`);
    expect(groupText(page, "Type")).not.toMatch(/Unknown|Partial|Conflicting|Not found/);
  });

  // behavioural
  it("the list is operable from the keyboard: one button per offering, none nested in another control", async () => {
    const page = await open[source]();
    const all = rows(page);
    expect(all).toHaveLength(OFFERINGS.length);
    all.forEach((row, i) => {
      const buttons = page.$(row).children("button[type=button]");
      expect(buttons, `row ${i + 1}`).toHaveLength(1);
      expect(page.$(buttons[0]).attr("tabindex")).toBeUndefined();
      expect(page.$(buttons[0]).find("button,a").length).toBe(0);
      expect(norm(page.$(buttons[0]).text())).toContain(i === 3 ? "Untitled offering 4" : OFFERINGS[i].name!);
    });
  });
});

describe("offerings evidence, draft and snapshot agree", () => {
  // behavioural
  it("a snapshot shows the same controls as its draft", async () => {
    for (const offering of [undefined, OFFERING_IDS[1]]) {
      const fromDraft = controls(await open.draft(offering));
      expect(fromDraft.length).toBeGreaterThan(5);
      const fromSnapshot = controls(await open.snapshot(offering));
      expect(fromSnapshot).toEqual(fromDraft);
    }
  });
});
