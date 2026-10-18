// The default Profile view keeps the evidence the previous profile exposed:
// a source control beside each cited value, historical-origin labels, and the
// reason a value is unknown, partial or in conflict. Checked for the draft and
// for a saved snapshot, through the real server page.
import { describe, expect, it } from "vitest";
import { VERSIONS } from "../helpers/knowledge-view-fixtures";
import { banner, card, cardText, norm, parse, textOf, type Page } from "../helpers/knowledge-view-dom";
import { openSection, titlesOf, type LockedSection } from "../helpers/knowledge-view-spec";
import {
  EXCERPT,
  ITEM_MARKS,
  REASONS,
  evidenceDraft,
  evidenceSnapshot,
  markOf,
  type EvidenceOptions,
} from "../helpers/knowledge-view-evidence";
import { renderViewPage } from "../helpers/knowledge-view-render";

const open = {
  draft: (section: LockedSection, opts?: EvidenceOptions) => openSection(section, { draft: evidenceDraft(opts) }),
  snapshot: (section: LockedSection, opts?: EvidenceOptions) => openSection(section, { snapshot: evidenceSnapshot(opts) }),
};
const channelMark = markOf(ITEM_MARKS.find((m) => m.card === "Channels")!, 0);
const inCard = (page: Page, section: LockedSection, title: string) => card(page, title, titlesOf(section))!;
const triggers = (page: Page, el: Parameters<Page["$"]>[0]) =>
  page.$(el as never).find("button.citation-popover__trigger").toArray().map((b) => ({
    label: norm(page.$(b).text()),
    name: page.$(b).attr("aria-label"),
  }));

describe.each(["draft", "snapshot"] as const)("evidence in the Profile view (%s)", (source) => {
  // behavioural
  it("a cited value has a Sources control beside it, named for its field", async () => {
    const page = await open[source]("General Info");
    expect(triggers(page, inCard(page, "General Info", "Overview"))).toEqual([
      { label: "Sources ⓘ", name: "Evidence for overview" },
    ]);
  });

  // behavioural
  it("historical generated and inferred values carry their label", async () => {
    const sales = await open[source]("Sales & Marketing", { marks: [channelMark] });
    const pitch = triggers(sales, inCard(sales, "Sales & Marketing", "Pitch"));
    expect(pitch).toHaveLength(1);
    expect(pitch[0].label).toBe("Historical generated · approved ⓘ");
    expect(triggers(sales, inCard(sales, "Sales & Marketing", "Channels")).map((t) => t.label)).toEqual([
      "Historical inferred ⓘ",
      "Historical inferred ⓘ",
    ]);
  });

  // behavioural
  it("a partial field says so and why, next to its value", async () => {
    const page = await open[source]("Customers & Industry");
    const text = cardText(page, inCard(page, "Customers & Industry", "Business model"));
    expect(text).toContain("Partial");
    expect(text).toContain(REASONS.partial);
  });

  // behavioural
  it("a conflict shows as conflicting sources with its reason, and on the control", async () => {
    const page = await open[source]("Customers & Industry");
    const el = banner(page, "Industry", "Specialty coffee roasting and retail")!;
    expect(textOf(page, el)).toContain("conflict");
    expect(norm(page.$("body").text())).toContain(`Conflicting sources — ${REASONS.conflict}`);
  });

  // behavioural
  it("an empty field shows why it is unknown, assessed or not", async () => {
    const general = await open[source]("General Info");
    const story = cardText(general, inCard(general, "General Info", "Founding story"));
    expect(story).toMatch(/No founding story yet/i);
    expect(story).toContain("Not found in checked pages");
    expect(story).toContain(REASONS.notFound);
    const customers = await open[source]("Customers & Industry");
    const suppliers = cardText(customers, inCard(customers, "Customers & Industry", "Suppliers"));
    expect(suppliers).toContain("Unknown · Not assessed");
    expect(suppliers).toContain(REASONS.notChecked);
    // Customer needs is empty and was never assessed: still an explicit unknown, not silence.
    const sales = await open[source]("Sales & Marketing");
    const needs = cardText(sales, inCard(sales, "Sales & Marketing", "Customer needs"));
    expect(needs).toContain("Unknown · Not assessed");
    expect(needs).toContain("No assessment is recorded for this field.");
  });

  // behavioural
  it("the crawl source-coverage panel is reachable in the Profile view", async () => {
    const page = await open[source]("General Info");
    expect(page.$("details.source-coverage > summary").text()).toContain("source coverage");
  });
});

describe("evidence is data, not decoration", () => {
  // behavioural
  it("Edge case: a company with no provenance at all shows no source controls on empty cards, and still renders", async () => {
    const page = parse(await renderViewPage({ draft: (await import("../helpers/knowledge-view-fixtures")).buildEmptyDraft(), versions: VERSIONS }));
    expect(page.$("button.citation-popover__trigger").length).toBe(0);
    expect(norm(page.$("body").text())).toContain("Unknown · Not assessed");
  });

  // behavioural
  it("the cited excerpt is not printed in the closed view (it opens from the control)", async () => {
    const page = await open.draft("General Info");
    expect(page.html).not.toContain(EXCERPT);
  });
});
