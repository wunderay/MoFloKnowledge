// Brand Identity: website observations are not shown as confirmed brand guidance.
// An observed color or an unconfirmed font carries a visible qualifier (also in its
// accessible name), observed colors never take the Primary/Secondary/Tertiary position
// wording, and the card subtitles claim nothing. Draft and saved snapshot.
import { describe, expect, it } from "vitest";
import { COMPANY_NAME } from "../helpers/knowledge-view-fixtures";
import { card, deepestContaining, norm, textOf, type Page } from "../helpers/knowledge-view-dom";
import { brandBanner, labelGroup, spaced } from "../helpers/knowledge-view-offerings-brand-dom";
import { openBrand } from "../helpers/knowledge-view-offerings-brand-render";
import { COLORS, FONTS, brandDraft, brandSnapshot } from "../helpers/knowledge-view-offerings-brand-fixtures";
import { buildObEvidence } from "../helpers/knowledge-view-offerings-brand-evidence";
import { DraftResponseSchema } from "../../src/contracts/api-responses";
import { KnowledgeBaseExportSchema } from "../../src/contracts";

const CARDS = ["Logos", "Colors", "Fonts"];
const CELLS = ["Display name", "Logo", "Palette"];
const OBSERVED_COLOR = "Observed website color";
const OBSERVED_FONT = "Observed, not confirmed as brand guidance";
const POSITION = /\b(Primary|Secondary|Tertiary)\b/;
const observed = (c: (typeof COLORS)[number], apparent_role: string | null = null) => ({ ...c, classification: "observed_website_color" as const, apparent_role });
const confirmed = (c: (typeof COLORS)[number], apparent_role: string | null = null) => ({ ...c, classification: "brand_guide_confirmed" as const, apparent_role });
const unconfirmed = (f: (typeof FONTS)[number], observations: ("css_declared" | "resource_loaded" | "computed_family")[] = []) => ({ ...f, brand_confirmed: false, observations });

/** Every color and font is only an observation. */
const allObserved = {
  brand_colors: [observed(COLORS[0]), observed(COLORS[1]), observed(COLORS[2], "Page background")],
  fonts: [unconfirmed(FONTS[0], ["computed_family", "css_declared"]), unconfirmed(FONTS[1]), unconfirmed(FONTS[2])],
};
const mixed = {
  brand_colors: [observed(COLORS[0]), confirmed(COLORS[1], "Brand red"), confirmed(COLORS[2])],
  fonts: [unconfirmed(FONTS[0]), FONTS[1]],
};
type Parts = Parameters<typeof brandDraft>[0];
const open = {
  draft: (parts?: Parts) => openBrand({ draft: brandDraft(parts) }),
  snapshot: (parts?: Parts) => openBrand({ snapshot: brandSnapshot(brandDraft(parts)) }),
};
const cardOf = (page: Page, title: string) => card(page, title, CARDS)!;
const itemOf = (page: Page, title: string, text: string) =>
  page.$(deepestContaining(page, cardOf(page, title), text)[0]).closest("li")[0];
const cell = (page: Page, label: string) => textOf(page, labelGroup(page, label, CELLS, brandBanner(page, COMPANY_NAME)!)!);

describe("observed fixtures", () => {
  // guard
  it("are valid drafts and snapshots", () => {
    for (const parts of [allObserved, mixed]) {
      expect(() => DraftResponseSchema.parse(brandDraft(parts))).not.toThrow();
      expect(() => KnowledgeBaseExportSchema.parse(brandSnapshot(brandDraft(parts)).payload)).not.toThrow();
    }
  });
});

describe.each(["draft", "snapshot"] as const)("observed brand values (%s)", (source) => {
  it("every observed color is qualified and none reads as Primary, Secondary or Tertiary", async () => {
    const page = await open[source](allObserved);
    const colors = cardOf(page, "Colors");
    for (const [i, hex] of [COLORS[0].hex, COLORS[1].hex, COLORS[2].hex].entries()) {
      const text = spaced(page, itemOf(page, "Colors", hex));
      expect(text, hex).toContain(OBSERVED_COLOR);
      expect(text, hex).not.toMatch(POSITION);
      if (i < 2) {
        expect(text).toMatch(new RegExp(`Color ${i + 1}\\b`));
      }
    }
    // an observed color keeps the role the site suggests, still qualified
    expect(spaced(page, itemOf(page, "Colors", COLORS[2].hex))).toContain("Page background");
    expect(textOf(page, colors)).not.toMatch(POSITION);
  });

  it("every unconfirmed font is qualified, with how it was observed, and none is called Primary", async () => {
    const page = await open[source](allObserved);
    const fonts = cardOf(page, "Fonts");
    expect(textOf(page, fonts)).not.toMatch(POSITION);
    for (const family of FONTS.map((f) => f.family)) {
      expect(spaced(page, itemOf(page, "Fonts", family))).toContain(OBSERVED_FONT);
    }
    expect(spaced(page, itemOf(page, "Fonts", "Fraunces"))).toContain("computed font family, declared CSS");
    expect(spaced(page, itemOf(page, "Fonts", "Fraunces"))).toMatch(/Font 1\b/);
  });

  it("the banner palette and font cells carry the qualifier too", async () => {
    const page = await open[source](allObserved);
    expect(cell(page, "Palette")).toContain("Observed website colors");
    expect(textOf(page, brandBanner(page, COMPANY_NAME)!)).toContain(OBSERVED_FONT);
    const swatches = page.$(labelGroup(page, "Palette", CELLS, brandBanner(page, COMPANY_NAME)!)!).find("[role=img]").toArray().map((el) => page.$(el).attr("aria-label"));
    expect(swatches).toEqual([
      `Color 1 ${COLORS[0].hex}, observed website color`,
      `Color 2 ${COLORS[1].hex}, observed website color`,
      `Page background ${COLORS[2].hex}, observed website color`,
    ]);
  });

  it("a confirmed color shows its role without the qualifier, next to an observed one", async () => {
    const page = await open[source](mixed);
    const red = spaced(page, itemOf(page, "Colors", COLORS[1].hex));
    expect(red).toContain("Brand red");
    expect(red).not.toContain("Observed");
    const third = spaced(page, itemOf(page, "Colors", COLORS[2].hex));
    expect(third).toMatch(/\bTertiary\b/);
    expect(third).not.toContain("Observed");
    expect(spaced(page, itemOf(page, "Colors", COLORS[0].hex))).toContain(OBSERVED_COLOR);
    // the confirmed font has no qualifier, the unconfirmed one does
    expect(spaced(page, itemOf(page, "Fonts", "Inter"))).not.toContain("Observed");
    expect(spaced(page, itemOf(page, "Fonts", "Fraunces"))).toContain(OBSERVED_FONT);
    expect(cell(page, "Palette")).toContain("Includes observed website colors");
  });

  it("a brand with only confirmed values shows no qualifier anywhere", async () => {
    const page = await open[source]();
    expect(norm(page.$(".knowledge-view__panel").text())).not.toMatch(/Observed/);
    expect(spaced(page, itemOf(page, "Fonts", "Fraunces"))).toMatch(/\bPrimary\b/);
  });

  it("the Colors and Fonts card subtitles do not claim brand use", async () => {
    const page = await open[source](allObserved);
    for (const title of ["Colors", "Fonts"]) {
      expect(textOf(page, cardOf(page, title))).not.toMatch(/used across|brand colors/i);
    }
  });
});

describe.each(["draft", "snapshot"] as const)("observed brand values, evidence names (%s)", (source) => {
  it("an item's evidence control names the item and its qualifier", async () => {
    const business = (b: { branding_and_style: object }) =>
      Object.assign(b.branding_and_style, { brand_colors: allObserved.brand_colors, fonts: allObserved.fonts });
    const fx = buildObEvidence({ business: business as never });
    const page = await openBrand(source === "draft" ? { draft: fx.draft } : { snapshot: fx.snapshot() });
    const names = page.$(".knowledge-view__panel button.citation-popover__trigger").toArray().map((b) => page.$(b).attr("aria-label") ?? "");
    expect(names).toContain(`User correction: evidence for Color 2 ${COLORS[1].hex}, observed website color`);
    expect(names).toContain(`User correction: evidence for Inter, ${OBSERVED_FONT.toLowerCase()}`);
    for (const name of names) {
      expect(name).not.toContain("@");
    }
  });
});
