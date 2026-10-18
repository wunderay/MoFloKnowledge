// Structure-agnostic queries for the Business Offerings and Brand Identity
// sections. They find things by visible text, accessible names, aria state,
// hrefs and style colours; never by class names or nesting depth.
import type { AnyNode, Element } from "domhandler";
import {
  contains,
  headings,
  inSelectorOrForm,
  norm,
  sectionSelector,
  textNodes,
  textOf,
  type Page,
} from "./knowledge-view-dom";

const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();
export function ancestorsOf(node: AnyNode): Element[] {
  const out: Element[] = [];
  for (let p = node.parent as Element | null; p; p = p.parent as Element | null) {
    if (p.type === "tag") {
      out.push(p);
    }
  }
  return out;
}
export const bodyNode = (page: Page) => page.$("body")[0];

/** Visible text with a space between separate text nodes (so "#1F4E79" + "Primary" stay two words). */
export function spaced(page: Page, el: AnyNode): string {
  const parts: string[] = [];
  const walk = (n: AnyNode) => {
    if (n.type === "text") {
      parts.push((n as unknown as { data: string }).data);
    } else if (n.type === "tag" && ["script", "style"].includes((n).name)) {
      // script and style text is not content
    } else if ("children" in n) {
      (n.children as AnyNode[]).forEach(walk);
    }
  };
  walk(el);
  void page;
  return norm(parts.join(" "));
}

// ---- labelled groups -------------------------------------------------------------
/**
 * The group of a label ("Cost", "Palette"…): the largest container of the label's
 * text that holds none of the other labels. The label may be a heading or plain text.
 * With `scope`, the search stays inside it.
 */
export function labelGroup(page: Page, label: string, allLabels: string[], scope?: Element): Element | null {
  const inScope = (n: AnyNode) => !scope || contains(scope, n);
  const nodesOf = (l: string) =>
    textNodes(page).filter((t) => inScope(t.node) && same(t.text.replace(/:$/, ""), l));
  const others = allLabels.filter((l) => !same(l, label)).flatMap(nodesOf);
  for (const mine of nodesOf(label)) {
    let found: Element = mine.el;
    for (const parent of ancestorsOf(mine.el)) {
      if (["body", "html", "main"].includes(parent.name)) {
        break;
      }
      if (scope && !contains(scope, parent)) {
        break;
      }
      const sel = sectionSelector(page);
      if (sel && contains(parent, sel)) {
        break;
      }
      if (others.some((o) => contains(parent, o.node))) {
        break;
      }
      found = parent;
    }
    return found;
  }
  return null;
}
/** What the group shows besides its own label. */
export function groupValue(page: Page, group: Element, label: string): string {
  return norm(textOf(page, group).replace(new RegExp(`${label}:?`, "i"), " "));
}
export function addLinksOf(page: Page, el: AnyNode): string[] {
  return page.$(el as Element).find("a[href]").toArray()
    .filter((a) => norm(page.$(a).text()) === "+ Add")
    .map((a) => page.$(a).attr("href")!);
}
/** Links of an element whose visible text starts with "+" (Add / Upload …). */
export function plusLinks(page: Page, el: AnyNode): { text: string; href: string }[] {
  return page.$(el as Element).find("a[href]").toArray()
    .map((a) => ({ text: norm(page.$(a).text()), href: page.$(a).attr("href")! }))
    .filter((l) => l.text.startsWith("+"));
}
export const triggers = (page: Page, el: AnyNode) =>
  page.$(el as Element).find("button.citation-popover__trigger").toArray().map((b) => norm(page.$(b).text()));

/** Largest container of the first text node containing `needle` that holds no `others` and stays in `scope`. */
export function itemScope(page: Page, scope: Element, needle: string, others: string[]): Element | null {
  const low = (s: string) => s.toLowerCase();
  const has = (n: AnyNode, s: string) => low(norm(page.$(n as Element).text())).includes(low(s));
  const first = textNodes(page).find((t) => contains(scope, t.node) && low(t.text).includes(low(needle)));
  if (!first) {
    return null;
  }
  let found: Element = first.el;
  for (const parent of ancestorsOf(first.el)) {
    if (!contains(scope, parent) && parent !== scope) {
      break;
    }
    if (others.some((o) => has(parent, o))) {
      break;
    }
    found = parent;
  }
  return found;
}

// ---- the offerings list -------------------------------------------------------------
const LISTISH = new Set(["ul", "ol", "nav", "menu"]);
const LISTROLES = new Set(["list", "navigation", "listbox", "tablist", "menu", "radiogroup"]);
function accessibleName(page: Page, el: Element): string {
  const { $ } = page;
  const label = $(el).attr("aria-label");
  if (label) {
    return norm(label);
  }
  const by = $(el).attr("aria-labelledby");
  if (by) {
    return norm(by.split(/\s+/).map((i) => $(`[id="${i}"]`).text()).join(" "));
  }
  return "";
}
/** The list/navigation whose accessible name mentions offerings. */
export function offeringsList(page: Page): Element | null {
  const { $ } = page;
  return (
    ($("*").toArray() as Element[]).find((el) => {
      const role = $(el).attr("role");
      return (
        (LISTISH.has(el.name) || (role && LISTROLES.has(role))) &&
        /offerings/i.test(accessibleName(page, el)) &&
        !inSelectorOrForm(page, el)
      );
    }) ?? null
  );
}
/** The rows of a list: its <li>/role=option/role=tab children, else its direct element children. */
export function listRows(page: Page, list: Element): Element[] {
  const { $ } = page;
  const items = $(list).find("li,[role=listitem],[role=option],[role=tab],[role=menuitem]").toArray();
  const top = items.filter((el) => !items.some((o) => o !== el && contains(o, el)));
  return top.length ? top : $(list).children().toArray().filter((c) => c.type === "tag");
}
const SELECTED_ATTRS = ["aria-current", "aria-selected", "aria-pressed", "aria-checked", "data-selected", "data-active"];
export function isSelectedRow(page: Page, row: Element): boolean {
  const { $ } = page;
  const on = (el: Element) =>
    SELECTED_ATTRS.some((a) => {
      const v = $(el).attr(a);
      return v !== undefined && v !== "false" && v !== "";
    }) || $(el).attr("checked") !== undefined || $(el).attr("selected") !== undefined;
  return on(row) || $(row).find("*").toArray().some((d) => on(d));
}

// ---- headings with counts ---------------------------------------------------------------
/** The count shown with the heading `title`: the first bare number in the smallest container that has one and no list. */
export function countBadge(page: Page, title: string, notIn?: Element | null): { heading: boolean; count: number | null } {
  const head = headings(page).find((h) => new RegExp(`^${title}\\b`, "i").test(h.text) && !inSelectorOrForm(page, h.el));
  if (!head) {
    return { heading: false, count: null };
  }
  const numbers = (scope: Element) =>
    textNodes(page).filter((t) => contains(scope, t.node) && /^\d+$/.test(t.text) && !(notIn && contains(notIn, t.node)));
  for (const scope of [head.el, ...ancestorsOf(head.el)]) {
    if (["body", "html", "main"].includes(scope.name)) {
      break;
    }
    const found = numbers(scope);
    if (found.length) {
      return { heading: true, count: Number(found[0].text) };
    }
  }
  return { heading: true, count: null };
}

// ---- colours in style attributes ----------------------------------------------------------
const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/g;
const two = (n: number) => n.toString(16).padStart(2, "0");
function expand(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}
/** Colours (#rrggbb, lower case) that an element's own style attribute paints. */
export function ownColors(page: Page, el: Element): string[] {
  const style = page.$(el).attr("style") ?? "";
  const out = (style.match(HEX_RE) ?? []).map(expand);
  for (const m of style.matchAll(RGB_RE)) {
    out.push(`#${two(+m[1])}${two(+m[2])}${two(+m[3])}`);
  }
  return out;
}
/** Every colour painted by style attributes inside `scope`, in document order (repeats kept). */
export function paintedColors(page: Page, scope: Element): string[] {
  const nodes = [scope, ...page.$(scope).find("*").toArray()];
  return nodes.flatMap((el) => ownColors(page, el));
}
export const lc = (hex: string) => hex.toLowerCase();

/** All style attributes on the page, as written. */
export function allStyles(page: Page): string[] {
  return page.$("[style]").toArray().map((el) => page.$(el).attr("style") ?? "");
}

// ---- brand banner ---------------------------------------------------------------------------
/**
 * The brand banner: from the smallest container holding the "Brand Identity" label and the
 * company-name heading, grown to the largest container that still holds neither the
 * section selector nor the Logos / Colors / Fonts card headings.
 */
export function brandBanner(page: Page, companyName: string): Element | null {
  const labels = textNodes(page).filter((t) => same(t.text, "Brand Identity"));
  const heads = headings(page).filter((h) => same(h.text, companyName));
  const cards = headings(page).filter((h) => ["Logos", "Colors", "Fonts"].some((t) => same(t, h.text)));
  const sel = sectionSelector(page);
  for (const l of labels) {
    let best: Element | null = null;
    for (const parent of ancestorsOf(l.node)) {
      if (["body", "html", "main"].includes(parent.name)) {
        break;
      }
      if (sel && contains(parent, sel)) {
        break;
      }
      if (cards.some((c) => contains(parent, c.el))) {
        break;
      }
      if (heads.some((h) => contains(parent, h.el))) {
        best = parent;
      }
    }
    if (best) {
      return best;
    }
  }
  return null;
}
/** The text-bearing http(s)/non-http images of a scope. */
export const imagesIn = (page: Page, scope: Element) =>
  page.$(scope).find("img").toArray().map((i) => ({ src: page.$(i).attr("src") ?? "", alt: page.$(i).attr("alt") ?? "" }));

/** The smallest container holding both elements (or null). */
export function commonAncestor(a: Element, b: Element): Element | null {
  for (const p of [a, ...ancestorsOf(a)]) {
    if (contains(p, b)) {
      return p;
    }
  }
  return null;
}
