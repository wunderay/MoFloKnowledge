// Acceptance, Quest Q8 offerings-brand-edit, B: Brand Identity edits in place (owner, draft version).
//
// Public contract (roles, names, requests; no class names, no structure):
//  - "Edit Display name" in the banner opens a text field "Display name"; Enter or blur sends PATCH /api/companies/:id
//    {name, expectedGeneration}; empty text is refused with "Enter a name.".
//  - "Edit Color N" opens "Color N"; a valid #RGB / #RRGGBB is stored upper-case and marks the color brand_guide_confirmed.
//    "Add color" / "Add font" open a field of that name; "Remove Color N" / "Remove Font N" / "Remove Logo N" remove one item.
//  - Each change is one revision of the branding_and_style entry. A viewer or a snapshot has none of the controls.
import { describe, expect, it, vi } from "vitest";
import {
  COMPANY_ID,
  UUID,
  alertText,
  blur,
  click,
  focusedIs,
  key,
  nothingSent,
  pageText,
  revisionWrite,
  startEdit,
  textbox,
  type,
  valueOf,
  withField,
  editAndEnter,
} from "../helpers/knowledge-view-inline-edit";
import { COMPANY_NAME, VERSIONS, draftFrom } from "../helpers/knowledge-view-fixtures";
import { brandBusiness, brandSnapshot } from "../helpers/knowledge-view-offerings-brand-fixtures";
import {
  brandDraftAs,
  editingControls,
  mustButton,
  openOB,
  storedBrand,
} from "../helpers/knowledge-view-offerings-brand-edit";

vi.setConfig({ testTimeout: 60_000 });

/** The standard brand with its third color observed (so that an edit proves the owner's value is confirmed). */
const observedThird = () => {
  const business = brandBusiness();
  business.branding_and_style.brand_colors[2].classification = "observed_website_color";
  return draftFrom(business);
};
const open = (draft = brandDraftAs()) => openOB("Brand Identity", { draft });
const NEEDS_ALERT = "Enter a color as #RGB or #RRGGBB";

describe("B0 read-only views have no editing controls", () => {
  it.each([
    ["a viewer's draft", () => ({ draft: brandDraftAs("viewer") })],
    ["a saved snapshot", () => ({ snapshot: brandSnapshot(), versions: VERSIONS })],
  ])("%s: no Edit / Add / Remove button and no text field", async (_name, make) => {
    const { view } = await openOB("Brand Identity", make());
    expect(editingControls(view).map((n) => view.nameOf(n))).toEqual([]);
    nothingSent(view);
  });

  it("an editable draft has 'Add color' and 'Add font' buttons", async () => {
    const { view } = await open();
    mustButton(view, "Add color");
    mustButton(view, "Add font");
  });
});

describe("B1 Display name", () => {
  it("'Edit Display name' opens the text field holding the name, focused, caret at the end", async () => {
    const { view } = await open();
    const input = await startEdit(view, { label: "Display name" });
    expect(valueOf(view, input)).toBe(COMPANY_NAME);
    expect(view.focusMovedInto(input) || focusedIs(input), "focused").toBe(true);
    expect(view.fakeOf(input)?.selection).toEqual([COMPANY_NAME.length, COMPANY_NAME.length]);
    nothingSent(view);
  });

  it.each(["Enter", "blur"])("%s sends one PATCH with the trimmed name and the draft's generation, then re-reads", async (how) => {
    const { view, api, server } = await open();
    const input = await startEdit(view, { label: "Display name" });
    await type(view, input, "  Harbor & Pine Roasters  ");
    if (how === "Enter") {
      await key(view, input, "Enter");
    } else {
      await blur(view, input);
    }
    await view.settle(8);
    expect(api.patches).toHaveLength(1);
    expect(api.patches[0].path).toBe(`/api/companies/${COMPANY_ID}`);
    expect(api.patches[0].body).toEqual({ name: "Harbor & Pine Roasters", expectedGeneration: 7 });
    expect(server.gets.filter((r) => r.path.endsWith("/draft")).length, "the draft is read again").toBeGreaterThanOrEqual(1);
    expect(view.byRole("heading").some((h) => view.text(h).includes("Harbor & Pine Roasters")), "the heading shows the new name").toBe(true);
  });

  it("empty text sends nothing and says 'Enter a name.'", async () => {
    const { view } = await open();
    await editAndEnter(view, { label: "Display name" }, "   ");
    nothingSent(view);
    expect(alertText(view)).toContain("Enter a name.");
  });

  it("unchanged text and Escape send nothing", async () => {
    const { view } = await open();
    const same = await startEdit(view, { label: "Display name" });
    await key(view, same, "Enter");
    nothingSent(view, "unchanged");
    const input = await startEdit(view, { label: "Display name" });
    await type(view, input, "Abandoned name");
    await key(view, input, "Escape");
    nothingSent(view, "Escape");
    expect(pageText(view)).not.toContain("Abandoned name");
  });

  it("a server failure shows its message in a role=alert", async () => {
    const { view, server } = await open();
    server.writeFailure = { status: 500, message: "Rename is down." };
    await editAndEnter(view, { label: "Display name" }, "Another name");
    expect(alertText(view)).toContain("Rename is down.");
  });
});

describe("B2 Colors", () => {
  it("'Edit Color N' opens a text field 'Color N' holding the current hex", async () => {
    const { view } = await open();
    const input = await startEdit(view, { label: "Color 2" });
    expect(valueOf(view, input)).toBe("#C8553D");
  });

  it.each([
    ["#abc", "#AABBCC"],
    ["#a1b2c3", "#A1B2C3"],
  ])("Enter with %s stores %s and confirms the color; the others stay", async (typed, stored) => {
    const { view } = await open(observedThird());
    const before = storedBrand(view);
    await editAndEnter(view, { label: "Color 3" }, typed);
    const { content } = revisionWrite(view, before);
    const colors = structuredClone(before.content.brand_colors);
    colors[2] = { ...colors[2], hex: stored, classification: "brand_guide_confirmed" };
    expect(content).toEqual(withField(before, ["brand_colors"], colors));
  });

  it.each(["red", "#12", "#GGGGGG", "123456"])("%s sends nothing and explains the format", async (text) => {
    const { view } = await open();
    await editAndEnter(view, { label: "Color 2" }, text);
    nothingSent(view);
    expect(alertText(view)).toContain(NEEDS_ALERT);
  });

  it("the unchanged hex sends nothing", async () => {
    const { view } = await open();
    await editAndEnter(view, { label: "Color 1" }, "#1F4E79");
    nothingSent(view);
  });

  it("'Add color' appends a confirmed color with a fresh id", async () => {
    const { view } = await open();
    const before = storedBrand(view);
    await click(view, mustButton(view, "Add color"));
    const input = textbox(view, "Add color");
    await type(view, input, "#0a0");
    await key(view, input, "Enter");
    await view.settle();
    const colors = revisionWrite(view, before).content.brand_colors;
    expect(colors.slice(0, 5)).toEqual(before.content.brand_colors);
    expect(colors[5]).toEqual({ id: expect.stringMatching(UUID), hex: "#00AA00", alpha: 1, apparent_role: null, classification: "brand_guide_confirmed" });
  });

  it("'Add color' with invalid text sends nothing and explains the format", async () => {
    const { view } = await open();
    await click(view, mustButton(view, "Add color"));
    const input = textbox(view, "Add color");
    await type(view, input, "green");
    await key(view, input, "Enter");
    nothingSent(view);
    expect(alertText(view)).toContain(NEEDS_ALERT);
  });

  it("'Remove Color 2' removes that color in one revision", async () => {
    const { view } = await open();
    const before = storedBrand(view);
    await click(view, mustButton(view, "Remove Color 2"));
    const colors = before.content.brand_colors.filter((_: unknown, i: number) => i !== 1);
    expect(revisionWrite(view, before).content).toEqual(withField(before, ["brand_colors"], colors));
  });

  it("a stale revision (409) shows a reload message and stores nothing", async () => {
    const { view, server } = await open();
    const before = storedBrand(view);
    const entry = (server.draft.entries as any[]).find((e) => e.kind === "branding_and_style");
    entry.revision = entry.current_revision = entry.current_revision + 7;
    await editAndEnter(view, { label: "Color 1" }, "#123456");
    expect(alertText(view)).toMatch(/reload/i);
    expect(entry.content.brand_colors).toEqual(before.content.brand_colors);
  });
});

describe("B3 Fonts", () => {
  it("'Add font' with Inter appends a confirmed font with a fresh id", async () => {
    const { view } = await open();
    const before = storedBrand(view);
    await click(view, mustButton(view, "Add font"));
    const input = textbox(view, "Add font");
    await type(view, input, "Inter");
    await key(view, input, "Enter");
    await view.settle();
    const fonts = revisionWrite(view, before).content.fonts;
    expect(fonts.slice(0, 3)).toEqual(before.content.fonts);
    expect(fonts[3]).toEqual({ id: expect.stringMatching(UUID), family: "Inter", apparent_use: null, observations: [], brand_confirmed: true });
  });

  it("blank text sends nothing and shows no error", async () => {
    const { view } = await open();
    await click(view, mustButton(view, "Add font"));
    const input = textbox(view, "Add font");
    await type(view, input, "   ");
    await key(view, input, "Enter");
    nothingSent(view);
    expect(alertText(view)).toBe("");
  });

  it("'Remove Font 2' removes that font in one revision", async () => {
    const { view } = await open();
    const before = storedBrand(view);
    await click(view, mustButton(view, "Remove Font 2"));
    const fonts = before.content.fonts.filter((_: unknown, i: number) => i !== 1);
    expect(revisionWrite(view, before).content).toEqual(withField(before, ["fonts"], fonts));
  });
});

describe("B4 Logos", () => {
  it("'Remove Logo 2' removes that logo in one revision", async () => {
    const { view } = await open();
    const before = storedBrand(view);
    await click(view, mustButton(view, "Remove Logo 2"));
    const logos = before.content.logos.filter((_: unknown, i: number) => i !== 1);
    expect(revisionWrite(view, before).content).toEqual(withField(before, ["logos"], logos));
  });
});
