// Acceptance: the Brand Identity section of /knowledge/view
// (Quest knowledge-view-offerings-brand, criteria C4, C5, C6, C7, C8 for brand).
// Assertions use headings, labels, displayed values, <img> attributes, painted colours,
// link hrefs and the absence of form controls; none depends on class names or markup depth.
import { describe, expect, it } from "vitest";
import {
  COMPANY_ID,
  COMPANY_NAME,
  EMPTY_COMPANY_ID,
  buildEmptyDraft,
  draftFrom,
} from "../helpers/knowledge-view-fixtures";
import { card, headings, norm, parse, selectorItems, textOf, type Page } from "../helpers/knowledge-view-dom";
import {
  allStyles,
  brandBanner,
  commonAncestor,
  groupValue,
  imagesIn,
  itemScope,
  labelGroup,
  paintedColors,
  plusLinks,
  spaced,
  addLinksOf,
  triggers,
} from "../helpers/knowledge-view-offerings-brand-dom";
import { openBrand, renderOB } from "../helpers/knowledge-view-offerings-brand-render";
import {
  COLORS,
  FONTS,
  HOSTILE,
  LOGOS,
  brandBusiness,
  brandDraft,
  brandSnapshot,
  brandingAddHref,
  emptyBrandDraft,
  evidenceFixture,
  manyColors,
} from "../helpers/knowledge-view-offerings-brand-fixtures";

type Element = NonNullable<ReturnType<typeof brandBanner>>;
const CARDS = ["Logos", "Colors", "Fonts"];
const CELLS = ["Display name", "Logo", "Palette"];
const SAMPLE = "The quick brown fox jumps over the lazy dog";
const BAD = /undefined|null|NaN|\[object/;
const ADD = brandingAddHref(COMPANY_ID);
const lc = (s: string) => s.toLowerCase();
const word = (label: string) => new RegExp(`(^|[^\\w])${label}($|[^\\w])`);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function bannerOf(page: Page, name = COMPANY_NAME): Element {
  const el = brandBanner(page, name);
  expect(el, 'a banner labelled "Brand Identity" with the company name as heading').not.toBeNull();
  return el!;
}
function cardOf(page: Page, title: string): Element {
  const el = card(page, title, CARDS);
  expect(el, `a card headed "${title}"`).not.toBeNull();
  return el!;
}
const cell = (page: Page, banner: Element, label: string) => {
  const g = labelGroup(page, label, CELLS, banner);
  expect(g, `the banner has a "${label}" cell`).not.toBeNull();
  return g!;
};
/** The tile of one item inside a card, found by a text it shows. */
function tile(page: Page, scope: Element, needle: string, others: string[]): Element {
  const el = itemScope(page, scope, needle, others);
  expect(el, `an item showing "${needle}"`).not.toBeNull();
  return el!;
}

describe("C4 banner", () => {
  // behavioural
  it("is labelled Brand Identity, headed by the company name, with a Display name caption", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const banner = bannerOf(page);
    expect(headings(page).some((h) => lc(h.text) === lc(COMPANY_NAME) && page.$(banner).find("*").toArray().some((e) => e === h.el))).toBe(true);
    cell(page, banner, "Display name");
    expect(groupValue(page, cell(page, banner, "Display name"), "Display name")).toContain(COMPANY_NAME);
  });

  // behavioural
  it("the Logo cell shows the primary (first) logo as an image with alt text", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const images = imagesIn(page, cell(page, bannerOf(page), "Logo"));
    expect(images.map((i) => i.src)).toEqual([LOGOS[0]!.url]);
    expect(images[0]!.alt.trim(), "alt text").not.toBe("");
  });

  // behavioural
  it("the Palette cell shows swatches for the first three brand colours only", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const painted = paintedColors(page, cell(page, bannerOf(page), "Palette"));
    expect(uniq(painted)).toEqual(COLORS.slice(0, 3).map((c) => lc(c.hex)));
  });

  // behavioural
  it("the banner names the primary (first) font only", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const text = textOf(page, bannerOf(page));
    expect(text).toContain("Fraunces");
    expect(text).not.toContain("Inter");
    expect(text).not.toContain("IBM Plex Mono");
  });

  // behavioural
  it("Edge case: two colours give two swatches, one logo gives one image", async () => {
    const page = await openBrand({ draft: brandDraft({ brand_colors: COLORS.slice(0, 2), logos: LOGOS.slice(0, 1) }) });
    const banner = bannerOf(page);
    expect(uniq(paintedColors(page, cell(page, banner, "Palette")))).toEqual(COLORS.slice(0, 2).map((c) => lc(c.hex)));
    expect(imagesIn(page, cell(page, banner, "Logo"))).toHaveLength(1);
  });

  // behavioural
  it("Edge case: fourteen colours still show only the first three in the banner", async () => {
    const colors = manyColors(14);
    const page = await openBrand({ draft: brandDraft({ brand_colors: colors }) });
    const painted = paintedColors(page, cell(page, bannerOf(page), "Palette"));
    expect(uniq(painted)).toEqual(colors.slice(0, 3).map((c) => lc(c.hex)));
  });

  // behavioural
  it("Edge case: a very long company name is kept whole as the heading", async () => {
    const name = `${"Harbor and Pine Coffee Roasting Cooperative ".repeat(8)}Ltd`;
    const page = await openBrand({ draft: draftFrom(brandBusiness(), { name }) });
    expect(textOf(page, bannerOf(page, name))).toContain(name);
  });

  // behavioural
  it("Edge case: a company name with HTML special characters is text in the banner", async () => {
    const name = `Fish & Chips <b>Ltd</b> <script>alert(1)</script>`;
    const page = await openBrand({ draft: draftFrom(brandBusiness(), { name }) });
    expect(textOf(page, bannerOf(page, name))).toContain(name);
    expect(page.html).not.toContain("<script>alert");
    expect(page.$("b").length).toBe(0);
  });
});

describe("C4 Logos card", () => {
  // behavioural
  it("lists Logos, Colors and Fonts cards in that order", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const order = headings(page).map((h) => h.text);
    const at = CARDS.map((t) => order.indexOf(t));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  // behavioural
  it("shows every logo as an image with alt text, labelled Primary / its own label / Logo", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const logos = cardOf(page, "Logos");
    expect(imagesIn(page, logos).map((i) => i.src)).toEqual(LOGOS.map((l) => l.url));
    for (const image of imagesIn(page, logos)) expect(image.alt.trim()).not.toBe("");
    const labels = ["Primary", "Stacked lockup", "Logo"];
    labels.slice(0, 2).forEach((label, i) => {
      const t = tile(page, logos, label, labels.filter((l) => l !== label));
      expect(imagesIn(page, t).map((x) => x.src), `the "${label}" tile holds its own image`).toEqual([LOGOS[i]!.url]);
    });
    // "Logo" is also the start of the card's own title, so the third tile is found by its image.
    const third = page.$(logos).find("img").toArray().map((img) => page.$(img)).find((img) => img.attr("src") === LOGOS[2]!.url)!;
    expect(norm(third.closest("li").text()), "a logo without a variant is captioned exactly Logo").toBe("Logo");
  });

  // behavioural
  it("has an upload/add link to the branding editor", async () => {
    const page = await openBrand({ draft: brandDraft() });
    expect(plusLinks(page, cardOf(page, "Logos")).map((l) => l.href)).toContain(ADD);
  });

  // behavioural
  it("Edge case: a very long logo label is kept whole", async () => {
    const variant = `${"Extra wide horizontal lockup ".repeat(10)}final`;
    const logos = [LOGOS[0]!, { ...LOGOS[1]!, variant }];
    const page = await openBrand({ draft: brandDraft({ logos }) });
    expect(textOf(page, cardOf(page, "Logos"))).toContain(variant);
  });
});

describe("C4 Colors card", () => {
  // behavioural
  it("shows each colour as a swatch with its hex value as text and its name or a positional fallback", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const colors = cardOf(page, "Colors");
    const hexes = COLORS.map((c) => lc(c.hex));
    const labels = ["Primary", "Roast red", "Tertiary", "Color 4", "Color 5"];
    COLORS.forEach((c, i) => {
      const t = tile(page, colors, c.hex, hexes.filter((h) => h !== lc(c.hex)));
      expect(paintedColors(page, t), `swatch for ${c.hex}`).toContain(lc(c.hex));
      expect(spaced(page, t), `label for ${c.hex}`).toMatch(word(labels[i]!));
      expect(lc(textOf(page, t))).toContain(lc(c.hex));
    });
    // a named colour is not also called Secondary
    expect(spaced(page, tile(page, colors, COLORS[1]!.hex, hexes.filter((h) => h !== lc(COLORS[1]!.hex))))).not.toMatch(word("Secondary"));
  });

  // behavioural
  it("has an add colour link to the branding editor", async () => {
    const page = await openBrand({ draft: brandDraft() });
    expect(plusLinks(page, cardOf(page, "Colors")).map((l) => l.href)).toContain(ADD);
  });

  // behavioural
  it("Edge case: fourteen colours are all shown, labelled Primary, Secondary, Tertiary, then Color 4 to Color 14", async () => {
    const list = manyColors(14);
    const page = await openBrand({ draft: brandDraft({ brand_colors: list }) });
    const colors = cardOf(page, "Colors");
    const hexes = list.map((c) => lc(c.hex));
    const labels = ["Primary", "Secondary", "Tertiary", ...Array.from({ length: 11 }, (_, i) => `Color ${i + 4}`)];
    list.forEach((c, i) => {
      const t = tile(page, colors, c.hex, hexes.filter((h) => h !== lc(c.hex)));
      expect(paintedColors(page, t), `swatch for ${c.hex}`).toContain(lc(c.hex));
      expect(spaced(page, t), `${c.hex} is "${labels[i]}"`).toMatch(word(labels[i]!));
    });
  });

  // behavioural
  it("Edge case: a very long colour name is kept whole", async () => {
    const role = `${"Deep harbor navy with a slight green cast ".repeat(5)}end`;
    const colors = [{ ...COLORS[0]!, apparent_role: role }, COLORS[1]!];
    const page = await openBrand({ draft: brandDraft({ brand_colors: colors }) });
    expect(textOf(page, cardOf(page, "Colors"))).toContain(role);
  });
});

describe("C4 Fonts card", () => {
  // behavioural
  it("shows a row per font: Primary / Font N label, family name, and the sample sentence", async () => {
    const page = await openBrand({ draft: brandDraft() });
    const fonts = cardOf(page, "Fonts");
    const families = FONTS.map((f) => f.family);
    const labels = ["Primary", "Font 2", "Font 3"];
    FONTS.forEach((f, i) => {
      const t = tile(page, fonts, f.family, families.filter((x) => x !== f.family));
      const text = spaced(page, t);
      expect(text, `row for ${f.family}`).toMatch(word(labels[i]!));
      expect(text).toContain(SAMPLE);
    });
    expect(textOf(page, fonts).split(SAMPLE).length - 1, "one sample line per font").toBe(3);
  });

  // behavioural
  it("has an add link to the branding editor", async () => {
    const page = await openBrand({ draft: brandDraft() });
    expect(plusLinks(page, cardOf(page, "Fonts")).map((l) => l.href)).toContain(ADD);
  });

  // behavioural (defensive: FontSchema requires a family)
  it("Edge case: a font without a family does not break the others or print 'null'", async () => {
    const fonts = [FONTS[0]!, { ...FONTS[1]!, family: null as unknown as string }, FONTS[2]!];
    const page = await openBrand({ draft: brandDraft({ fonts }) });
    const card_ = cardOf(page, "Fonts");
    const text = textOf(page, card_);
    expect(text).toContain("Fraunces");
    expect(text).toContain("IBM Plex Mono");
    expect(text).not.toMatch(BAD);
    expect(textOf(page, bannerOf(page))).not.toMatch(BAD);
  });

  // behavioural
  it("Edge case: a very long family name is kept whole", async () => {
    const family = `${"Grotesque Display Condensed ".repeat(10)}Std`;
    const page = await openBrand({ draft: brandDraft({ fonts: [{ ...FONTS[0]!, family }] }) });
    expect(textOf(page, cardOf(page, "Fonts"))).toContain(family);
    expect(textOf(page, bannerOf(page))).toContain(family);
  });
});

describe("C5 empty states", () => {
  const empties = [
    ["a company whose branding is blank", emptyBrandDraft(), COMPANY_ID],
    ["a company with no entries at all", buildEmptyDraft(), EMPTY_COMPANY_ID],
  ] as const;

  // behavioural
  it.each(empties)("%s: every card has an empty state with + Add to the branding editor", async (_n, draft, companyId) => {
    const page = await openBrand({ draft });
    for (const title of CARDS) {
      const el = cardOf(page, title);
      expect(addLinksOf(page, el), `card "${title}"`).toEqual([brandingAddHref(companyId)]);
      expect(textOf(page, el)).not.toMatch(BAD);
      expect(page.$(el).find("img").length).toBe(0);
    }
  });

  // behavioural
  it.each(empties)("%s: the banner keeps the name and shows placeholders, never 'undefined' or 'null'", async (_n, draft) => {
    const page = await openBrand({ draft });
    const banner = bannerOf(page);
    expect(textOf(page, banner)).not.toMatch(BAD);
    expect(imagesIn(page, banner)).toEqual([]);
    expect(paintedColors(page, banner)).toEqual([]);
    for (const label of ["Logo", "Palette"])
      expect(groupValue(page, cell(page, banner, label), label), `"${label}" cell has a placeholder`).not.toBe("");
  });

  // behavioural
  it("Edge case: only the empty cards get an empty state", async () => {
    const page = await openBrand({ draft: brandDraft({ brand_colors: [], fonts: [] }) });
    expect(addLinksOf(page, cardOf(page, "Colors"))).toEqual([ADD]);
    expect(addLinksOf(page, cardOf(page, "Fonts"))).toEqual([ADD]);
    expect(imagesIn(page, cardOf(page, "Logos")).map((i) => i.src)).toEqual(LOGOS.map((l) => l.url));
    expect(paintedColors(page, cell(page, bannerOf(page), "Palette"))).toEqual([]);
  });

  // behavioural
  it("values are text: no form control sits in the banner or the cards", async () => {
    const page = await openBrand({ draft: brandDraft() });
    for (const el of [bannerOf(page), ...CARDS.map((t) => cardOf(page, t))])
      expect(page.$(el).find("input,textarea,select").length).toBe(0);
  });
});

describe("C6 security", () => {
  const validOthers = [LOGOS[1]!.url, LOGOS[2]!.url];
  const schemeOf = (v: string) => /^\s*([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  function expectNoUnsafeUrls(page: Page) {
    for (const el of page.$("[href],[src],[action],[formaction]").toArray())
      for (const attr of ["href", "src", "action", "formaction"]) {
        const scheme = schemeOf(page.$(el).attr(attr) ?? "");
        if (scheme) expect(["http", "https"], `${attr} scheme`).toContain(scheme);
      }
  }

  // behavioural (defensive: LogoSchema's url rule already rejects these)
  it.each([
    ["javascript:", HOSTILE.jsLogo],
    ["data:", HOSTILE.dataLogo],
  ])("Edge case: a %s primary logo url renders no image and no unsafe attribute", async (_n, url) => {
    const logos = [{ ...LOGOS[0]!, url }, LOGOS[1]!, LOGOS[2]!];
    const page = await openBrand({ draft: brandDraft({ logos }) });
    expectNoUnsafeUrls(page);
    for (const img of page.$("img").toArray()) expect(schemeOf(page.$(img).attr("src") ?? "")).toMatch(/^https?$/);
    // the unsafe logo is shown by its label, the safe ones still as images
    const logosCard = cardOf(page, "Logos");
    expect(imagesIn(page, logosCard).map((i) => i.src)).toEqual(validOthers);
    expect(textOf(page, logosCard)).toContain("Primary");
    // the banner shows the primary logo's text, not an image (and not the second logo)
    const banner = cell(page, bannerOf(page), "Logo");
    expect(imagesIn(page, banner)).toEqual([]);
    expect(groupValue(page, banner, "Logo")).not.toBe("");
    expect(groupValue(page, banner, "Logo")).not.toMatch(BAD);
  });

  // behavioural (defensive: ColorSchema's hex rule already rejects these)
  it.each([
    ["css injection", HOSTILE.badHex],
    ["markup injection", HOSTILE.scriptHex],
    ["not a colour", "blue"],
    ["short hex", "#12345"],
  ])("Edge case: a %s hex value never reaches a style attribute", async (_n, hex) => {
    const colors = [{ ...COLORS[0]!, hex }, COLORS[1]!, COLORS[2]!];
    const page = await openBrand({ draft: brandDraft({ brand_colors: colors }) });
    const valid = [COLORS[1]!, COLORS[2]!].map((c) => lc(c.hex));
    // the valid colours are still painted (so the page is really rendered)
    expect(paintedColors(page, cardOf(page, "Colors"))).toEqual(expect.arrayContaining(valid));
    for (const style of allStyles(page)) {
      expect(style, "style attribute").not.toMatch(/url\(|expression|javascript|evil|[<>"]|blue/i);
      for (const found of style.match(/#[0-9a-f]{3,8}\b/gi) ?? []) expect(valid).toContain(lc(found));
    }
    expect(page.html).not.toContain("<script>alert");
    expect(paintedColors(page, cell(page, bannerOf(page), "Palette")).every((c) => valid.includes(c))).toBe(true);
    expectNoUnsafeUrls(page);
  });

  // behavioural
  it("a valid brand renders only http(s) images and links", async () => {
    const page = await openBrand({ draft: brandDraft() });
    expectNoUnsafeUrls(page);
    expect(imagesIn(page, cardOf(page, "Logos"))).toHaveLength(3);
  });
});

describe("C7 draft, saved snapshot and evidence", () => {
  const DRAFT_ONLY = /Edit draft|View draft|History|Remove from future versions/g;
  /** The section's output: the banner and the three cards. */
  function region(page: Page): string {
    const banner = bannerOf(page);
    const fonts = cardOf(page, "Fonts");
    const el = commonAncestor(banner, fonts)!;
    return textOf(page, el).replace(DRAFT_ONLY, "").replace(/\s+/g, " ").trim();
  }

  // behavioural
  it("a saved snapshot renders the same section output as its draft", async () => {
    const draft = brandDraft();
    const fromDraft = region(await openBrand({ draft }));
    const fromSnapshot = region(await openBrand({ snapshot: brandSnapshot(draft) }));
    expect(fromDraft).toContain("Fraunces");
    expect(fromSnapshot).toEqual(fromDraft);
  });

  // behavioural
  it("a snapshot paints the same swatches and images as its draft", async () => {
    const draft = brandDraft();
    const a = await openBrand({ draft });
    const b = await openBrand({ snapshot: brandSnapshot(draft) });
    expect(paintedColors(b, cardOf(b, "Colors"))).toEqual(paintedColors(a, cardOf(a, "Colors")));
    expect(imagesIn(b, cardOf(b, "Logos"))).toEqual(imagesIn(a, cardOf(a, "Logos")));
    expect(paintedColors(a, cardOf(a, "Colors")).length).toBeGreaterThanOrEqual(COLORS.length);
  });

  describe.each(["draft", "snapshot"] as const)("evidence (%s)", (source) => {
    // behavioural (presence only)
    it("Logos, Colors and Fonts each keep a Sources control when claims exist", async () => {
      const fx = evidenceFixture();
      const page = await openBrand(source === "draft" ? { draft: fx.draft } : { snapshot: fx.snapshot() });
      for (const title of CARDS)
        expect(triggers(page, cardOf(page, title)).some((t) => t.startsWith("Sources")), `card "${title}"`).toBe(true);
    });
  });
});

describe("C8 non-regression", () => {
  // non-regression (the Q2 sections themselves are covered by tests/components/knowledge-view-*.test.tsx)
  it("the brand parameters do not disturb General Info, which shows no brand cards", async () => {
    const generalId = selectorItems(parse(await renderOB({ draft: brandDraft() }))).find((i) => i.label === "General Info")!.value;
    const page = parse(await renderOB({ draft: brandDraft(), section: generalId }));
    const titles = headings(page).map((h) => h.text);
    expect(titles).toEqual(expect.arrayContaining(["Headquarters", "Overview", "Founding story"]));
    for (const t of CARDS) expect(titles).not.toContain(t);
    expect(norm(page.$("body").text())).not.toContain("#1F4E79");
  });
});
