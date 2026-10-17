// Structure-agnostic queries over rendered /knowledge/view markup. They find
// things by what a visitor perceives (accessible names, headings, visible text)
// and by containment, never by CSS class names or element nesting depth.
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export type Page = { $: cheerio.CheerioAPI; html: string };
export const parse = (html: string): Page => ({ $: cheerio.load(html), html });
export const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();

const HEADING = "h1,h2,h3,h4,h5,h6,[role=heading]";

function ancestors(node: AnyNode): Element[] {
  const out: Element[] = [];
  for (let p = node.parent as Element | null; p; p = p.parent as Element | null)
    if (p.type === "tag") out.push(p);
  return out;
}
export function contains(outer: AnyNode, inner: AnyNode): boolean {
  for (let p: AnyNode | null = inner; p; p = p.parent as AnyNode | null)
    if (p === outer) return true;
  return false;
}
export const textOf = ({ $ }: Page, el: AnyNode) => norm($(el).text());

// ---- the section selector ---------------------------------------------------
// The selector is a listbox: the server markup carries its trigger (a button named "Knowledge section"
// that shows the current section) and the options, hidden while the list is closed, each with its
// identifier in data-section.
function triggerName(page: Page, el: Element): string {
  const { $ } = page;
  const label = $(el).attr("aria-label");
  if (label) return norm(label);
  const by = $(el).attr("aria-labelledby");
  return by ? norm(by.split(/\s+/).map((id) => $(`[id="${id}"]`).text()).join(" ")) : norm($(el).text());
}
/** The trigger button of the section listbox. */
export function selectorTrigger(page: Page): Element | null {
  const { $ } = page;
  const found = $('button[aria-haspopup="listbox"]').toArray().filter((el) => /^knowledge section/i.test(triggerName(page, el)));
  return (found[0] as Element | undefined) ?? null;
}
/** The control that holds the section selector (the trigger's wrapper, so the whole control is skipped as page content). */
export function sectionSelector(page: Page): Element | null {
  const trigger = selectorTrigger(page);
  return trigger ? ((trigger.parent as Element | null) ?? trigger) : null;
}
export type SelectorItem = { label: string; value: string; selected: boolean };
/** The listbox's options in document order, with the identifier each one submits; the selected one has aria-selected=true. */
export function selectorItems(page: Page): SelectorItem[] {
  const root = sectionSelector(page);
  if (!root) return [];
  const { $ } = page;
  return $(root)
    .find('[role="option"]')
    .toArray()
    .map((el) => ({
      label: norm($(el).text()),
      value: $(el).attr("data-section") ?? "",
      selected: $(el).attr("aria-selected") === "true",
    }));
}
export function selectedSection(page: Page): string[] {
  return selectorItems(page).filter((i) => i.selected).map((i) => i.label);
}
export const inSelectorOrForm = (page: Page, node: AnyNode) => {
  const sel = sectionSelector(page);
  return ancestors(node).some(
    (a) => a === sel || ["select", "option", "script", "style"].includes(a.name),
  ) || (sel !== null && contains(sel, node));
};

// ---- text nodes, headings, cards ---------------------------------------------
type TextNode = { text: string; node: AnyNode; el: Element };
export function textNodes(page: Page): TextNode[] {
  const out: TextNode[] = [];
  const walk = (n: AnyNode) => {
    if (n.type === "text") {
      const text = norm((n as unknown as { data: string }).data);
      if (text && n.parent && !inSelectorOrForm(page, n))
        out.push({ text, node: n, el: n.parent as Element });
    } else if ("children" in n) (n.children as AnyNode[]).forEach(walk);
  };
  walk(page.$.root()[0] as AnyNode);
  return out;
}
const inHeading = (n: TextNode) => ancestors(n.node).some((a) => /^h[1-6]$/.test(a.name));
export function headingText(page: Page, el: Element): string {
  const { $ } = page;
  const clone = $(el).clone();
  clone.find("button,svg,.citation-popover,[aria-hidden=true]").remove();
  return norm(clone.text());
}
export function headings(page: Page): { el: Element; text: string }[] {
  return page.$(HEADING).toArray().map((el) => ({ el, text: headingText(page, el) }));
}
export const hasHeading = (page: Page, text: string) =>
  headings(page).some((h) => same(h.text, text));

/**
 * The smallest container of the heading `title` that is not shared with any
 * other heading of the same section ("the card"). Returns null if absent.
 */
export function card(page: Page, title: string, siblingTitles: string[]): Element | null {
  const all = headings(page);
  const mine = all.filter((h) => same(h.text, title) && !inSelectorOrForm(page, h.el));
  const others = all.filter(
    (h) => siblingTitles.some((t) => same(t, h.text) && !same(t, title)) && !inSelectorOrForm(page, h.el),
  );
  for (const heading of mine) {
    let best = heading.el;
    for (const parent of ancestors(heading.el)) {
      if (["body", "html", "main"].includes(parent.name)) break;
      if (others.some((o) => contains(parent, o.el))) break;
      best = parent;
    }
    return best;
  }
  return null;
}
/** Visible text of an element, minus the heading itself. */
export function cardText(page: Page, el: Element): string {
  const { $ } = page;
  const clone = $(el).clone();
  clone.find(HEADING).first().remove();
  return norm(clone.text());
}
export function controlsIn(page: Page, el: AnyNode): string[] {
  return page.$(el as Element).find("input,textarea,select").toArray().map((c) => (c as Element).name);
}
/** The "+ Add" links inside an element, as hrefs. */
export function addLinks(page: Page, el: AnyNode): string[] {
  const { $ } = page;
  return $(el as Element)
    .find("a[href]")
    .toArray()
    .filter((a) => norm($(a).text()) === "+ Add")
    .map((a) => $(a).attr("href")!);
}

/** Deepest elements (inside `scope`) whose text contains `needle`. */
export function deepestContaining(page: Page, scope: Element, needle: string): Element[] {
  const { $ } = page;
  return $(scope)
    .find("*")
    .toArray()
    .filter((el) => norm($(el).text()).includes(needle))
    .filter((el) => !$(el).children().toArray().some((c) => norm($(c).text()).includes(needle)));
}
/** Every item sits in its own element, and no element holds two items. */
export function separateChips(page: Page, scope: Element, items: string[]): string | null {
  const holders = items.map((item) => deepestContaining(page, scope, item)[0]);
  for (const [i, h] of holders.entries()) if (!h) return `no element holds "${items[i]}"`;
  if (new Set(holders).size !== items.length) return "two items share one element";
  for (const [i, h] of holders.entries())
    for (const [j, other] of items.entries())
      if (i !== j && textOf(page, h!).includes(other)) return `"${items[i]}" and "${other}" share an element`;
  return null;
}

// ---- banners and stats --------------------------------------------------------
/**
 * The banner: the smallest container holding both the eyebrow `label` and a
 * heading with `headingValue`, that does not also hold the section selector.
 */
export function banner(page: Page, label: string, headingValue: string): Element | null {
  const labels = textNodes(page).filter((t) => same(t.text, label));
  const heads = headings(page).filter((h) => same(h.text, headingValue));
  for (const l of labels) {
    for (const parent of ancestors(l.node)) {
      const sel = sectionSelector(page);
      if (sel && contains(parent, sel)) break;
      if (heads.some((h) => contains(parent, h.el))) return parent;
    }
  }
  return null;
}
const numberRe = (n: number) => new RegExp(`(^|[^\\d.,])${n}([^\\d]|$)`);
/**
 * The element that groups a stat's label with its value: the smallest container
 * of the label that holds no other stat label. `value` (string or number) must
 * appear in it. `scope` limits the search (e.g. to the banner).
 */
export function statGroup(page: Page, scope: Element, label: string, allLabels: string[]): Element | null {
  const labelNodes = (l: string) =>
    textNodes(page).filter((t) => !inHeading(t) && contains(scope, t.node) &&
      (same(t.text.replace(/:$/, ""), l) || new RegExp(`^${l}[:\\s]+\\S`, "i").test(t.text)));
  const others = allLabels.filter((l) => !same(l, label)).flatMap(labelNodes);
  for (const mine of labelNodes(label)) {
    let found: Element | null = null;
    for (const parent of [mine.el, ...ancestors(mine.el)]) {
      if (!contains(scope, parent) && parent !== scope) break;
      if (others.some((o) => contains(parent, o.node))) break;
      found = parent;
      if (norm(textOf(page, parent)).length > label.length) break;
    }
    if (found) return found;
  }
  return null;
}
export function statValue(page: Page, group: Element, label: string): string {
  return norm(textOf(page, group).replace(new RegExp(`${label}:?`, "i"), " "));
}
export function statShows(page: Page, scope: Element, label: string, allLabels: string[], expected: string | number): boolean {
  const group = statGroup(page, scope, label, allLabels);
  if (!group) return false;
  const text = statValue(page, group, label);
  return typeof expected === "number" ? numberRe(expected).test(text) : text.includes(expected);
}
/** Column holding `platform` next to a text containing `handle` (case-insensitive). */
export function socialColumn(page: Page, scope: Element, platform: string, handle: string, platforms: string[]): boolean {
  const nodes = (p: string) => textNodes(page).filter((t) => contains(scope, t.node) && same(t.text.replace(/:$/, ""), p));
  const others = platforms.filter((p) => p !== platform).flatMap(nodes);
  for (const mine of nodes(platform)) {
    for (const parent of [mine.el, ...ancestors(mine.el)]) {
      if (!contains(scope, parent) && parent !== scope) break;
      if (others.some((o) => contains(parent, o.node))) break;
      if (textOf(page, parent).toLowerCase().includes(handle.toLowerCase())) return true;
    }
  }
  return false;
}
