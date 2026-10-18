// Structure-agnostic queries over rendered /knowledge/view markup for the Site Knowledge card, the
// "Import from website" control and the All sections view. They find things by visible text,
// headings, accessible names and hrefs; never by class names or nesting depth.
import type { AnyNode, Element } from "domhandler";
import {
  contains,
  headings,
  inSelectorOrForm,
  norm,
  sectionSelector,
  type Page,
} from "./knowledge-view-dom";
import { SITE_HEADING, type Link } from "./knowledge-view-site-all-fixtures";

export const BAD = /undefined|NaN|\[object|\bnull\b/;
export const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();

export function ancestorsOf(node: AnyNode): Element[] {
  const out: Element[] = [];
  for (let p = node.parent as Element | null; p; p = p.parent as Element | null) {
    if (p.type === "tag") {
      out.push(p);
    }
  }
  return out;
}
const textOfEl = (page: Page, el: AnyNode) => norm(page.$(el as Element).text());

/** Document-order position of every element, for "A comes before B" checks. */
export function orderIndex(page: Page): Map<AnyNode, number> {
  const out = new Map<AnyNode, number>();
  let i = 0;
  const walk = (n: AnyNode) => {
    out.set(n, i++);
    if ("children" in n) {
      (n.children as AnyNode[]).forEach(walk);
    }
  };
  walk(page.$.root()[0] as AnyNode);
  return out;
}

// ---- the Site Knowledge card ------------------------------------------------------------------------
export function siteHeading(page: Page): Element | null {
  return headings(page).find((h) => SITE_HEADING.test(h.text) && !inSelectorOrForm(page, h.el))?.el ?? null;
}
/**
 * The card: the largest container of the card heading that holds no other heading and not the section
 * selector (so it never swallows a section heading, another section, or the page chrome).
 */
export function siteCard(page: Page): Element | null {
  const heading = siteHeading(page);
  if (!heading) {
    return null;
  }
  const others = headings(page).filter((h) => h.el !== heading && !inSelectorOrForm(page, h.el));
  const selector = sectionSelector(page);
  let best: Element = heading;
  for (const parent of ancestorsOf(heading)) {
    if (["body", "html", "main"].includes(parent.name)) {
      break;
    }
    if (selector && contains(parent, selector)) {
      break;
    }
    // A heading inside an open dialog or a citation popover belongs to that overlay, not to a sibling section.
    if (others.some((o) => contains(parent, o.el) && !page.$(o.el).closest("[role=dialog],dialog").length)) {
      break;
    }
    best = parent;
  }
  return best;
}
/** Visible text of the card without its own heading. */
export function siteCardText(page: Page, card: Element): string {
  const clone = page.$(card).clone();
  clone.find("h1,h2,h3,h4,h5,h6,[role=heading]").first().remove();
  clone.find("[role=dialog],dialog").remove();
  return norm(clone.text());
}

/** The container of one link: the largest container of its title text that holds no other link's title. */
export function linkItem(page: Page, card: Element, link: Link, all: Link[]): Element | null {
  const has = (el: AnyNode, text: string) => textOfEl(page, el).includes(text);
  const first = page.$(card).find("*").toArray().find((el) => {
    const kids = page.$(el).children().toArray();
    return has(el, link.title) && !kids.some((k) => has(k, link.title)) ;
  });
  if (!first) {
    return null;
  }
  const others = all.filter((l) => l.id !== link.id).map((l) => l.title).filter((t) => !link.title.includes(t));
  let best: Element = first;
  for (const parent of ancestorsOf(first)) {
    if (!contains(card, parent) && parent !== card) {
      break;
    }
    if (others.some((t) => has(parent, t))) {
      break;
    }
    best = parent;
  }
  return best;
}
export interface Anchor { href: string; rel: string[]; target: string | undefined; text: string; label: string }
export function anchorsIn(page: Page, el: AnyNode): Anchor[] {
  return page.$(el as Element).find("a[href]").toArray().map((a) => ({
    href: page.$(a).attr("href")!,
    rel: (page.$(a).attr("rel") ?? "").split(/\s+/).filter(Boolean),
    target: page.$(a).attr("target"),
    text: norm(page.$(a).text()),
    label: norm(page.$(a).attr("aria-label") ?? ""),
  }));
}
/** href as the browser would resolve it, for comparing with the stored URL. */
export const resolved = (href: string) => {
  try {
    return new URL(href).href;
  } catch {
    return href;
  }
};
export const normalizedUrl = (url: string) => {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
};
/** The "+ Add page" links inside an element. */
export function addPageLinks(page: Page, el: AnyNode): string[] {
  return page.$(el as Element).find("a[href]").toArray()
    .filter((a) => /^\+\s*add page$/i.test(norm(page.$(a).text())))
    .map((a) => page.$(a).attr("href")!);
}

// ---- the import control -----------------------------------------------------------------------------------
const CONTROL = "button,[role=button],input[type=button],input[type=submit],a[role=button]";
function controlName(page: Page, el: Element): string {
  const aria = page.$(el).attr("aria-label");
  if (aria) {
    return norm(aria);
  }
  if (el.name === "input") {
    return norm(page.$(el).attr("value") ?? "");
  }
  return norm(page.$(el).text());
}
export function importControls(page: Page): Element[] {
  return page.$(CONTROL).toArray().filter((el) => /^import from website$/i.test(controlName(page, el)));
}

// ---- All sections -------------------------------------------------------------------------------------------
export const ALL_ORDER = [
  "General Info",
  "Brand Identity",
  "Business Offerings",
  "Customers & Industry",
  "Sales & Marketing",
  "Key People",
  "Site Knowledge",
] as const;
/** The first visible heading of a section: its label, optionally followed by a count ("Business Offerings 4"). */
export function sectionHeading(page: Page, label: string): Element | null {
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s+\\d+)?$`, "i");
  return headings(page).find((h) => pattern.test(h.text) && !inSelectorOrForm(page, h.el))?.el ?? null;
}

// ---- ids ------------------------------------------------------------------------------------------------------
export function duplicateIds(page: Page): string[] {
  const seen = new Map<string, number>();
  for (const el of page.$("[id]").toArray()) {
    const id = page.$(el).attr("id")!;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}
