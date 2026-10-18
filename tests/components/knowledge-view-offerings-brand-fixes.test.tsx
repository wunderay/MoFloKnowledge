// Three fixes to the Brand Identity and Business Offerings views,
// checked in a viewer's draft (read only) and in an editable draft.
//  - A color whose hex is not #RRGGBB, and a font without a family, stay visible as "unavailable" (never painted).
//  - A logo whose address is not http(s) shows no image and says why; a logo without a variant is captioned "Logo".
//  - The Cost evidence control follows the field the cost text is built from.
import { describe, expect, it, vi } from "vitest";
import { COMPANY_NAME, draftFrom } from "../helpers/knowledge-view-fixtures";
import { card, deepestContaining, norm, textOf, type Page } from "../helpers/knowledge-view-dom";
import { allStyles, brandBanner, imagesIn, paintedColors } from "../helpers/knowledge-view-offerings-brand-dom";
import {
  COLORS,
  FONTS,
  LOGOS,
  OFFERING_IDS,
  OFFERINGS,
  brandBusiness,
} from "../helpers/knowledge-view-offerings-brand-fixtures";
import { EVIDENCE_ID, buildObEvidence } from "../helpers/knowledge-view-offerings-brand-evidence";
import { openOB } from "../helpers/knowledge-view-offerings-brand-edit";

vi.setConfig({ testTimeout: 60_000 });

const CARDS = ["Logos", "Colors", "Fonts"];
// A saved snapshot is validated when it is read, so read-only is a viewer's draft here.
type Mode = "viewer" | "draft";
async function openBrand(mode: Mode, parts: Parameters<typeof brandBusiness>[0]) {
  const draft = draftFrom(brandBusiness(parts), { role: mode === "viewer" ? "viewer" : "owner" });
  const { view } = await openOB("Brand Identity", { draft });
  return view.page();
}
const cardOf = (page: Page, title: string) => card(page, title, CARDS)!;

describe("unusable colors and fonts stay visible", () => {
  it.each([
    ["viewer", "red"],
    ["draft", "#12"],
  ] as const)("(%s) a color with the hex %s keeps its tile, says 'unavailable' and is never painted", async (mode, bad) => {
    const colors = structuredClone(COLORS);
    colors[1] = { ...colors[1], hex: bad, apparent_role: "Accent" };
    const page = await openBrand(mode, { brand_colors: colors });
    const text = textOf(page, cardOf(page, "Colors"));
    expect(text, "a tile named by position or role").toMatch(/Color 2|Accent/);
    expect(text).toContain("unavailable");
    const badStyle = bad === "red" ? /(^|[\s:;(])red($|[\s;)])/i : /#12(?![0-9a-f])/i;
    expect(allStyles(page).filter((s) => badStyle.test(s)), "no style carries the bad value").toEqual([]);
    const banner = brandBanner(page, COMPANY_NAME)!;
    expect(paintedColors(page, banner), "the banner palette shows only the valid colors").toEqual(["#1f4e79", "#f2e8cf", "#386641"]);
  });

  it.each(["viewer", "draft"] as const)("(%s) a font with a blank family keeps its row as 'Font 2' and says 'unavailable'", async (mode) => {
    const fonts = structuredClone(FONTS);
    fonts[1] = { ...fonts[1], family: "   " };
    const page = await openBrand(mode, { fonts });
    const text = textOf(page, cardOf(page, "Fonts"));
    expect(text).toContain("Font 2");
    expect(text).toContain("unavailable");
    expect(text).toContain("Fraunces");
    expect(text).toContain("IBM Plex Mono");
  });
});

describe("logos", () => {
  it.each([
    ["viewer", "javascript:alert(1)"],
    ["draft", "data:image/png;base64,AAAA"],
    ["viewer", "ftp://x/y.png"],
  ] as const)("(%s) a logo at %s shows no image and says the address is not http(s)", async (mode, url) => {
    const logos = structuredClone(LOGOS);
    logos[1] = { ...logos[1], url };
    const page = await openBrand(mode, { logos });
    const logosCard = cardOf(page, "Logos");
    const tile = page.$(deepestContaining(page, logosCard, "Stacked lockup")[0]).closest("li");
    expect(tile.length, "the tile keeps its variant caption").toBe(1);
    expect(tile.find("img").length, "no image").toBe(0);
    const text = norm(tile.text());
    expect(text).toContain("Image unavailable");
    expect(text).toContain("http");
    expect(imagesIn(page, logosCard).map((i) => i.src)).toEqual([LOGOS[0].url, LOGOS[2].url]);
  });
});

describe("Cost evidence follows the cost text's own field", () => {
  it("a cost built from the amount (raw is blank) has its source control from claims on /pricing", async () => {
    const ev = buildObEvidence({
      marks: [],
      coverage: () => [],
      business: (b) => {
        b.offerings[0].pricing!.raw = "   ";
      },
    });
    const first = OFFERINGS[0];
    const claim = {
      id: "00000000-0000-4000-8000-0000000a7001",
      entry_id: first.id,
      targets: [`/offerings/@${first.id}/pricing`],
      origin: "source_backed" as const,
      evidence_ids: [EVIDENCE_ID],
      based_on_claim_ids: [] as string[],
      actor_id: null,
      authored_at: null,
      note: null,
    };
    const entry = ev.draft.entries.find((e) => e.id === OFFERING_IDS[0])!;
    entry.provenance = { ...entry.provenance, sources: ev.sources, evidence: ev.evidence, claims: [claim] } as never;
    ev.draft.citationContext = { claims: [claim], evidence: ev.evidence, sources: ev.sources } as never;
    const { view } = await openOB("Business Offerings", { draft: ev.draft });
    expect(view.text()).toContain("18.00");
    const controls = view.byRole("button", new RegExp(`evidence for cost of ${first.name}`, "i"));
    expect(controls, "the Cost field's source control").toHaveLength(1);
  });
});
