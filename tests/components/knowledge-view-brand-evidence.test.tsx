// Brand Identity: evidence per list item, readable control and image names, coverage
// reasons in the banner and the cards. Draft and saved snapshot, through the real
// server page. Queries use accessible names, visible text and image attributes.
import { describe, expect, it } from "vitest";
import { COMPANY_NAME } from "../helpers/knowledge-view-fixtures";
import { card, deepestContaining, norm, textOf, type Page } from "../helpers/knowledge-view-dom";
import { brandBanner, imagesIn, labelGroup } from "../helpers/knowledge-view-offerings-brand-dom";
import { openBrand } from "../helpers/knowledge-view-offerings-brand-render";
import { LOGOS } from "../helpers/knowledge-view-offerings-brand-fixtures";
import { REASONS, buildObEvidence, type ObEvidenceOptions } from "../helpers/knowledge-view-offerings-brand-evidence";

const CARDS = ["Logos", "Colors", "Fonts"];
const CELLS = ["Display name", "Logo", "Palette"];
const open = {
  draft: (opts: ObEvidenceOptions = {}) => openBrand({ draft: buildObEvidence(opts).draft }),
  snapshot: (opts: ObEvidenceOptions = {}) => openBrand({ snapshot: buildObEvidence(opts).snapshot() }),
};
const noColorsOrFonts: ObEvidenceOptions = {
  business: (b) => Object.assign(b.branding_and_style, { brand_colors: [], fonts: [] }),
};
const cardOf = (page: Page, title: string) => card(page, title, CARDS)!;
const itemOf = (page: Page, title: string, text: string) =>
  page.$(deepestContaining(page, cardOf(page, title), text)[0]!).closest("li");
const markerNames = (page: Page, li: ReturnType<Page["$"]>) =>
  li.find("button.citation-popover__trigger").toArray().map((b) => page.$(b).attr("aria-label"));
const bannerCell = (page: Page, label: string) => textOf(page, labelGroup(page, label, CELLS, brandBanner(page, COMPANY_NAME)!)!);

describe.each(["draft", "snapshot"] as const)("brand evidence (%s)", (source) => {
  // behavioural
  it("only the user-corrected item of each list carries a marker, named by the item's own text", async () => {
    const page = await open[source]();
    // The source-backed first item and the untouched third item of each list have no marker.
    for (const [title, first, third] of [
      ["Logos", "Primary", "Logo 3"],
      ["Colors", "#1F4E79", "#F2E8CF"],
      ["Fonts", "Fraunces", "IBM Plex Mono"],
    ] as const) {
      expect(markerNames(page, itemOf(page, title, first)), `${title}: ${first}`).toEqual([]);
      expect(markerNames(page, itemOf(page, title, third)), `${title}: ${third}`).toEqual([]);
    }
    expect(markerNames(page, itemOf(page, "Logos", "Stacked lockup"))).toEqual(["User correction: evidence for Stacked lockup"]);
    expect(markerNames(page, itemOf(page, "Colors", "#C8553D"))).toEqual(["User correction: evidence for Roast red #C8553D"]);
    expect(markerNames(page, itemOf(page, "Fonts", "Inter"))).toEqual(["User correction: evidence for Inter"]);
  });

  // behavioural
  it("every card keeps its field-level evidence control", async () => {
    const page = await open[source]();
    for (const title of CARDS) {
      const labels = page.$(cardOf(page, title)).find(".knowledge-view__card-head button.citation-popover__trigger").toArray().map((b) => norm(page.$(b).text()));
      // The field's control names the user correction its list holds; sources back the rest.
      expect(labels, title).toEqual(["User correction ⓘ"]);
    }
  });

  // behavioural
  it("no evidence control is named by a raw id or path", async () => {
    const page = await open[source]();
    const names = page.$(".knowledge-view__panel button.citation-popover__trigger").toArray().map((b) => page.$(b).attr("aria-label") ?? "");
    expect(names.length).toBeGreaterThan(6);
    for (const name of names) {
      expect(name).not.toContain("@");
      expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });

  // behavioural
  it("images have meaningful alt text naming the company and the logo, never the address", async () => {
    const page = await open[source]();
    const all = imagesIn(page, page.$(".knowledge-view__panel")[0]!);
    expect(all.map((i) => i.src)).toEqual([LOGOS[0]!.url, ...LOGOS.map((l) => l.url)]);
    const labels = ["Primary", "Primary", "Stacked lockup", "Logo 3"];
    all.forEach((image, i) => {
      expect(image.alt).toContain(COMPANY_NAME);
      expect(image.alt).toContain(labels[i]!);
      expect(image.alt).not.toMatch(/https?:|\.svg|\.png/);
    });
  });

  // behavioural
  it("colour swatches in the banner are named by colour name and hex", async () => {
    const page = await open[source]();
    const swatches = page.$(labelGroup(page, "Palette", CELLS, brandBanner(page, COMPANY_NAME)!)!).find("[role=img]").toArray().map((el) => page.$(el).attr("aria-label"));
    expect(swatches).toEqual(["Primary #1F4E79", "Roast red #C8553D", "Tertiary #F2E8CF"]);
  });

  // behavioural
  it("a partly found field prints its reason in the banner cell and in the card", async () => {
    const page = await open[source]();
    expect(bannerCell(page, "Logo")).toContain(`Partial — ${REASONS.logos}`);
    expect(textOf(page, cardOf(page, "Logos"))).toContain(`Partial — ${REASONS.logos}`);
  });

  // behavioural
  it("empty colours and fonts print their reasons in the banner cells and the cards", async () => {
    const page = await open[source](noColorsOrFonts);
    expect(bannerCell(page, "Palette")).toContain(`Unknown · Not assessed — ${REASONS.noColors}`);
    expect(textOf(page, cardOf(page, "Colors"))).toContain(`Unknown · Not assessed — ${REASONS.noColors}`);
    expect(textOf(page, brandBanner(page, COMPANY_NAME)!)).toContain(`Not found in checked pages — ${REASONS.noFonts}`);
    expect(textOf(page, cardOf(page, "Fonts"))).toContain(`Not found in checked pages — ${REASONS.noFonts}`);
  });

  // behavioural
  it("empty fields with no assessment say so instead of staying silent", async () => {
    const page = await open[source]({ ...noColorsOrFonts, coverage: () => [] });
    for (const title of ["Colors", "Fonts"])
      expect(textOf(page, cardOf(page, title))).toContain("Unknown · Not assessed — No assessment is recorded for this field.");
    expect(bannerCell(page, "Palette")).toContain("Unknown · Not assessed — No assessment is recorded for this field.");
  });
});

describe("brand evidence, draft and snapshot agree", () => {
  // behavioural
  it("a snapshot shows the same controls and notes as its draft", async () => {
    const a = await open.draft();
    const b = await open.snapshot();
    const region = (page: Page) => textOf(page, page.$(".knowledge-view__panel")[0]!);
    expect(region(b)).toEqual(region(a));
    expect(region(a)).toContain(REASONS.logos);
  });
});
