// Acceptance (Quest Q10 navigation-listbox): the interactive behaviour of the
// "Knowledge section" listbox of /knowledge/view, driven through the interactive
// runtime (click, keydown, document events, recorded navigation).
// C1 order/labels, C3 ARIA, C4 keyboard, C5 Escape/click-outside, C6 state hook,
// C7 navigation keeps the other query parameters.
import { describe, expect, it } from "vitest";
import { buildDraft, snapshotFrom, SNAPSHOT_ID, VERSIONS } from "../helpers/knowledge-view-fixtures";
import { navigations } from "../helpers/knowledge-view-site-all-runtime";
import {
  LABELS,
  LISTBOX_SECTIONS,
  activeLabel,
  chooseByClick,
  clickOutside,
  isExpanded,
  listboxes,
  navigatedTo,
  need,
  open,
  openListboxView,
  optionLabels,
  options,
  press,
  stateHooks,
  trigger,
} from "../helpers/knowledge-view-listbox";

const draftView = (section?: string, extra?: Record<string, string>) =>
  openListboxView({ draft: buildDraft(), versions: VERSIONS, raw: section, extra });

describe("C1 order and labels", () => {
  // behavioural
  it("lists General Info, Brand Identity, Business Offerings, Customers & Industry, Sales & Marketing, Key People, Site Knowledge, All sections in that order", async () => {
    const view = await draftView();
    await open(view);
    expect(optionLabels(view)).toEqual(LABELS);
  });

  // behavioural
  it("Edge case: the same order for a saved snapshot", async () => {
    const view = await openListboxView({ snapshot: { payload: snapshotFrom(buildDraft()), versionId: SNAPSHOT_ID }, versions: VERSIONS });
    await open(view);
    expect(optionLabels(view)).toEqual(LABELS);
  });
});

describe("C3 ARIA roles and attributes", () => {
  // behavioural
  it("closed: the trigger is a collapsed button named 'Knowledge section' showing the current section, and no option is visible", async () => {
    const view = await draftView("sales");
    const t = trigger(view);
    expect(t.tag).toBe("button");
    expect(String(t.props["aria-haspopup"])).toBe("listbox");
    expect(String(t.props["aria-expanded"])).toBe("false");
    expect(view.nameOf(t)).toMatch(/^Knowledge section/i);
    expect(`${view.text(t)} ${view.nameOf(t)}`).toContain("Sales & Marketing");
    expect(options(view)).toHaveLength(0);
  });

  // behavioural
  it("open: aria-expanded is true and the trigger controls a role=listbox of eight role=option items", async () => {
    const view = await draftView();
    await open(view);
    const t = trigger(view);
    expect(String(t.props["aria-expanded"])).toBe("true");
    const lbs = listboxes(view);
    expect(lbs).toHaveLength(1);
    const lb = lbs[0]!;
    expect(lb.props.id, "the listbox has an id").toBeTruthy();
    expect(String(t.props["aria-controls"]), "the trigger's aria-controls names the listbox").toBe(String(lb.props.id));
    expect(options(view)).toHaveLength(LABELS.length);
  });

  // behavioural
  it.each(LISTBOX_SECTIONS)("?section=$id: only '$label' has aria-selected=true, and the trigger shows it", async ({ id, label }) => {
    const view = await draftView(id);
    expect(`${view.text(trigger(view))} ${view.nameOf(trigger(view))}`).toContain(label);
    await open(view);
    const selected = options(view).filter((o) => String(o.props["aria-selected"]) === "true");
    expect(selected.map((o) => view.nameOf(o))).toEqual([label]);
  });

  // behavioural
  it("Edge case: an unknown ?section= selects General Info in the listbox", async () => {
    const view = await draftView("nope");
    await open(view);
    expect(options(view).filter((o) => String(o.props["aria-selected"]) === "true").map((o) => view.nameOf(o))).toEqual(["General Info"]);
  });

  // behavioural
  it("Edge case: the trigger shows Key People when Key People is selected", async () => {
    const view = await draftView("key-people");
    expect(`${view.text(trigger(view))} ${view.nameOf(trigger(view))}`).toContain("Key People");
  });
});

describe("C4 keyboard", () => {
  // behavioural
  it("Home moves to the first option and End to the last", async () => {
    const view = await draftView("sales");
    await open(view);
    await press(view, "End");
    expect(activeLabel(view)).toBe("All sections");
    await press(view, "Home");
    expect(activeLabel(view)).toBe("General Info");
  });

  // behavioural
  it("ArrowDown moves to the next option, one at a time", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "Home");
    await press(view, "ArrowDown");
    expect(activeLabel(view)).toBe("Brand Identity");
    await press(view, "ArrowDown");
    expect(activeLabel(view)).toBe("Business Offerings");
  });

  // behavioural
  it("ArrowUp moves to the previous option, one at a time", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "End");
    await press(view, "ArrowUp");
    expect(activeLabel(view)).toBe("Site Knowledge");
    await press(view, "ArrowUp");
    expect(activeLabel(view)).toBe("Key People");
  });

  // behavioural
  it("Enter selects the active option: Home, ArrowDown, Enter navigates to ?section=brand", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "Home");
    await press(view, "ArrowDown");
    const option = need(options(view).find((o) => view.nameOf(o) === "Brand Identity"), "Brand Identity option");
    await press(view, "Enter");
    expect(navigatedTo(view, option)?.searchParams.get("section")).toBe("brand");
  });

  // behavioural
  it("Space selects the active option: End then Space navigates to ?section=all", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "End");
    await press(view, " ");
    expect(navigatedTo(view)?.searchParams.get("section")).toBe("all");
  });

  // behavioural
  it("Edge case: Key People is reachable by keyboard (Home plus five ArrowDown) and Enter selects ?section=key-people", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "Home");
    for (let i = 0; i < 5; i++) await press(view, "ArrowDown");
    expect(activeLabel(view)).toBe("Key People");
    await press(view, "Enter");
    expect(navigatedTo(view)?.searchParams.get("section")).toBe("key-people");
  });

  // behavioural
  it("Edge case: navigating the list alone does not navigate the page", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "Home");
    await press(view, "ArrowDown");
    await press(view, "End");
    expect(navigations()).toEqual([]);
    expect(activeLabel(view)).toBe("All sections");
  });
});

describe("C5 closing", () => {
  // behavioural
  it("Escape closes the listbox and returns focus to the trigger", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "ArrowDown");
    await press(view, "Escape");
    expect(isExpanded(view)).toBe("false");
    expect(options(view)).toHaveLength(0);
    const { focusedPath } = await import("../helpers/knowledge-view-site-all-runtime");
    expect(focusedPath()).toBe(trigger(view).path);
  });

  // behavioural
  it("Edge case: Escape does not navigate", async () => {
    const view = await draftView("sales");
    await open(view);
    await press(view, "End");
    await press(view, "Escape");
    expect(navigations()).toEqual([]);
    expect(`${view.text(trigger(view))} ${view.nameOf(trigger(view))}`).toContain("Sales & Marketing");
  });

  // behavioural
  it("a click outside the control closes the listbox without navigating", async () => {
    const view = await draftView();
    await open(view);
    await clickOutside(view);
    expect(isExpanded(view)).toBe("false");
    expect(options(view)).toHaveLength(0);
    expect(navigations()).toEqual([]);
  });

  // behavioural
  it("Edge case: the listbox can be opened again after Escape and after a click outside", async () => {
    const view = await draftView();
    await open(view);
    await press(view, "Escape");
    await open(view);
    expect(optionLabels(view)).toEqual(LABELS);
    await clickOutside(view);
    await open(view);
    expect(optionLabels(view)).toEqual(LABELS);
  });
});

describe("C6 open/closed state hook for the animation", () => {
  // behavioural
  it("closed carries data-state=closed (never open) on the trigger, its wrapper or the listbox", async () => {
    const view = await draftView();
    const states = stateHooks(view);
    expect(states).toContain("closed");
    expect(states).not.toContain("open");
  });

  // behavioural
  it("open carries data-state=open and not closed; Escape returns it to closed", async () => {
    const view = await draftView();
    await open(view);
    let states = stateHooks(view);
    expect(states).toContain("open");
    expect(states).not.toContain("closed");
    await press(view, "Escape");
    states = stateHooks(view);
    expect(states).toContain("closed");
    expect(states).not.toContain("open");
  });
});

describe("C7 selecting navigates to ?section=<id> and keeps the other query parameters", () => {
  // behavioural
  it.each(LISTBOX_SECTIONS)("clicking '$label' navigates to section=$id on /knowledge/view", async ({ id, label }) => {
    const view = await draftView("general");
    await open(view);
    const { url } = await chooseByClick(view, label);
    expect(url, `a navigation (link href or router/history call) to the "${label}" section`).not.toBeNull();
    expect(url!.pathname).toBe("/knowledge/view");
    expect(url!.searchParams.get("section")).toBe(id);
  });

  // behavioural
  it("keeps companyId and versionId=draft", async () => {
    const draft = buildDraft();
    const view = await openListboxView({ draft, versions: VERSIONS });
    await open(view);
    const { url } = await chooseByClick(view, "Customers & Industry");
    expect(url!.searchParams.get("companyId")).toBe(draft.company.id);
    expect(url!.searchParams.get("versionId")).toBe("draft");
    expect(url!.searchParams.get("section")).toBe("customers");
  });

  // behavioural
  it("keeps the saved version when viewing a snapshot", async () => {
    const draft = buildDraft();
    const view = await openListboxView({ snapshot: { payload: snapshotFrom(draft), versionId: SNAPSHOT_ID }, versions: VERSIONS, section: "General Info" });
    await open(view);
    const { url } = await chooseByClick(view, "Key People");
    expect(url!.searchParams.get("companyId")).toBe(draft.company.id);
    expect(url!.searchParams.get("versionId")).toBe(SNAPSHOT_ID);
    expect(url!.searchParams.get("section")).toBe("key-people");
  });

  // behavioural
  it("Edge case: any other query parameter survives, and the section is replaced rather than duplicated", async () => {
    const view = await draftView("sales", { utm: "newsletter" });
    await open(view);
    const { url } = await chooseByClick(view, "Brand Identity");
    expect(url!.searchParams.get("utm")).toBe("newsletter");
    expect(url!.searchParams.getAll("section")).toEqual(["brand"]);
  });
});
