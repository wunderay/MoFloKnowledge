// Acceptance: the markup a visitor receives for the
// /knowledge/view section control: default, ?section= mapping, Key People,
// fallback, the trigger, and the stylesheet hook. Rendered through the
// real server page with fixture data; assertions use roles, accessible names and text.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderViewPage } from "../helpers/knowledge-view-render";
import { buildDraft, buildEmptyDraft, snapshotFrom, SNAPSHOT_ID, VERSIONS } from "../helpers/knowledge-view-fixtures";
import { hasHeading, headings, norm, parse, type Page } from "../helpers/knowledge-view-dom";

const SECTIONS = [
  ["general", "General Info"],
  ["brand", "Brand Identity"],
  ["offerings", "Business Offerings"],
  ["customers", "Customers & Industry"],
  ["sales", "Sales & Marketing"],
  ["key-people", "Key People"],
  ["site", "Site Knowledge"],
  ["all", "All sections"],
] as const;

const draftPage = async (section?: string) =>
  parse(await renderViewPage({ draft: buildDraft(), versions: VERSIONS, section }));

/** The trigger: a button with aria-haspopup="listbox". */
function triggerOf(page: Page) {
  const { $ } = page;
  const found = $('button[aria-haspopup="listbox"]').toArray();
  expect(found.length, 'exactly one <button aria-haspopup="listbox"> section trigger').toBe(1);
  return $(found[0]);
}
function nameOf(page: Page, el: ReturnType<Page["$"]>): string {
  const label = el.attr("aria-label");
  if (label) {
    return norm(label);
  }
  const by = el.attr("aria-labelledby");
  if (by) {
    return norm(by.split(/\s+/).map((id) => page.$(`[id="${id}"]`).text()).join(" "));
  }
  return norm(el.text());
}
const shownSection = (page: Page) => {
  const trig = triggerOf(page);
  const haystack = `${trig.text()} ${nameOf(page, trig)}`;
  // the longest label contained in the trigger (so "All sections" is not mistaken for part of another)
  return SECTIONS.map(([, label]) => label).filter((label) => norm(haystack).includes(label));
};

describe("trigger (server markup)", () => {
  it("is a button with aria-haspopup=listbox, collapsed, named 'Knowledge section'", async () => {
    const page = await draftPage();
    const trig = triggerOf(page);
    expect(trig.attr("aria-expanded")).toBe("false");
    expect(nameOf(page, trig)).toMatch(/^Knowledge section/i);
  });

  it("replaces the native <select>: no combobox is named 'Knowledge section'", async () => {
    const page = await draftPage();
    expect(page.$('select[aria-label="Knowledge section"]').length).toBe(0);
    expect(page.$("select").toArray().map((s) => page.$(s).attr("aria-label"))).not.toContain("Knowledge section");
  });
});

describe("default and ?section= mapping", () => {
  it("shows General Info on the trigger by default (no section parameter)", async () => {
    expect(shownSection(await draftPage())).toEqual(["General Info"]);
  });

  it.each(SECTIONS)("?section=%s shows %s on the trigger", async (id, label) => {
    expect(shownSection(await draftPage(id))).toEqual([label]);
  });

  it.each(["not-a-section", "GENERAL", "", "__proto__", "0", "key_people", "keypeople"])(
    "Edge case: unknown ?section=%j falls back to General Info",
    async (value) => {
      const page = await draftPage(value);
      expect(shownSection(page)).toEqual(["General Info"]);
      expect(hasHeading(page, "Founding story")).toBe(true);
      expect(hasHeading(page, "Key People")).toBe(false);
    },
  );

  it("Edge case: the trigger is present and defaults to General Info for a snapshot and for an empty company", async () => {
    const draft = buildDraft();
    const snap = parse(await renderViewPage({ snapshot: { payload: snapshotFrom(draft), versionId: SNAPSHOT_ID }, versions: VERSIONS }));
    expect(shownSection(snap)).toEqual(["General Info"]);
    const empty = parse(await renderViewPage({ draft: buildEmptyDraft(), versions: [] }));
    expect(shownSection(empty)).toEqual(["General Info"]);
  });

  it("still shows only the chosen section's cards (sections keep their identifiers)", async () => {
    const customers = await draftPage("customers");
    expect(hasHeading(customers, "Business model")).toBe(true);
    expect(hasHeading(customers, "Founding story")).toBe(false);
    const sales = await draftPage("sales");
    expect(hasHeading(sales, "Calls to action")).toBe(true);
    expect(hasHeading(sales, "Business model")).toBe(false);
  });
});

/** The Key People heading carries a count badge ("Key People 0"); with no count given, any count. */
const hasPeopleHeading = (page: Page, count?: number) =>
  headings(page).some((h) => (count === undefined ? /^key people \d+$/i : new RegExp(`^key people ${count}$`, "i")).test(h.text));

describe("Key People (new section; its content has its own tests)", () => {
  it("?section=key-people renders without an error, under the company name, with a 'Key People' heading", async () => {
    const page = await draftPage("key-people");
    expect(page.html).not.toContain("knowledge is unavailable");
    expect(page.$("h1").toArray().map((h) => page.$(h).text())).toContain("Harbor & Pine Coffee Roasters");
    expect(hasPeopleHeading(page), "a heading 'Key People' with its count").toBe(true);
    expect(shownSection(page)).toEqual(["Key People"]);
  });

  it("Edge case: Key People does not show another section's cards", async () => {
    const page = await draftPage("key-people");
    expect(hasHeading(page, "Founding story")).toBe(false);
    expect(hasHeading(page, "Calls to action")).toBe(false);
    expect(hasHeading(page, "Business model")).toBe(false);
  });

  it("Edge case: Key People renders for a saved snapshot and for a company with no knowledge", async () => {
    const draft = buildDraft();
    const snap = parse(
      await renderViewPage({ snapshot: { payload: snapshotFrom(draft), versionId: SNAPSHOT_ID }, versions: VERSIONS, section: "key-people" }),
    );
    expect(hasPeopleHeading(snap), "a heading 'Key People' with its count").toBe(true);
    const empty = parse(await renderViewPage({ draft: buildEmptyDraft(), versions: [], section: "key-people" }));
    expect(empty.html).not.toContain("knowledge is unavailable");
    expect(hasPeopleHeading(empty, 0)).toBe(true);
  });
});

describe("animation hook (stylesheet)", () => {
  const css = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? css(join(dir, e.name)) : e.name.endsWith(".css") ? [readFileSync(join(dir, e.name), "utf8")] : [],
    );

  // (static analysis of the shipped stylesheets: the state hook drives a transition or animation)
  it("a [data-state=open] or [data-state=closed] rule sets a transition or animation", () => {
    const all = css(join(__dirname, "../../src")).join("\n");
    const rules = [...all.matchAll(/[^{}]*\[data-state=["']?(?:open|closed)["']?\][^{}]*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(rules.length, 'a CSS rule selecting [data-state="open"] / [data-state="closed"]').toBeGreaterThan(0);
    expect(rules.some((body) => /\b(transition|animation)\b/.test(body)), "such a rule declares transition or animation").toBe(true);
  });
});
