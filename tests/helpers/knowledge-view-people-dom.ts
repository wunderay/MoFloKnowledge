// Structure-agnostic queries for the Key People section: visible text, accessible names,
// aria state and hrefs; never class names or nesting depth.
import { expect } from "vitest";
import type { Element } from "domhandler";
import { headings, inSelectorOrForm, norm, textOf, textNodes, contains, type Page } from "./knowledge-view-dom";
import { isSelectedRow, labelGroup, listRows } from "./knowledge-view-offerings-brand-dom";

export const DETAIL = ["Name", "Position", "Age", "Gender", "Nationality", "Description"] as const;
export type Label = (typeof DETAIL)[number];
export const BAD = /undefined|null|NaN|\[object/;

const LISTISH = new Set(["ul", "ol", "nav", "menu"]);
const LISTROLES = new Set(["list", "navigation", "listbox", "tablist", "menu", "radiogroup"]);
const accessibleName = (page: Page, el: Element): string => {
  const { $ } = page;
  const label = $(el).attr("aria-label");
  if (label) return norm(label);
  const by = $(el).attr("aria-labelledby");
  return by ? norm(by.split(/\s+/).map((i) => $(`[id="${i}"]`).text()).join(" ")) : "";
};
/** The list/navigation whose accessible name mentions people (and is not the section selector). */
export function peopleList(page: Page): Element | null {
  const { $ } = page;
  return (
    ($("*").toArray() as Element[]).find((el) => {
      const role = $(el).attr("role");
      return (
        (LISTISH.has(el.name) || (role && LISTROLES.has(role))) &&
        /\bpeople\b|\bpersons?\b/i.test(accessibleName(page, el)) &&
        !inSelectorOrForm(page, el)
      );
    }) ?? null
  );
}
export const peopleRows = (page: Page): Element[] => {
  const list = peopleList(page);
  return list ? listRows(page, list) : [];
};
export const selectedIndexes = (page: Page): number[] =>
  peopleRows(page).map((r, i) => (isSelectedRow(page, r) ? i : -1)).filter((i) => i >= 0);

/** The detail card/label group of one field, or null. */
export const detailGroup = (page: Page, label: Label): Element | null => labelGroup(page, label, [...DETAIL]);
export function detail(page: Page): Record<Label, Element> {
  const out = {} as Record<Label, Element>;
  for (const label of DETAIL) {
    const group = detailGroup(page, label);
    expect(group, `the detail shows a "${label}" card/label`).not.toBeNull();
    out[label] = group!;
  }
  return out;
}
export const groupText = (page: Page, label: Label): string => {
  const group = detailGroup(page, label);
  return group ? norm(textOf(page, group).replace(new RegExp(`^${label}:?`, "i"), " ")) : "";
};

/** Accessible name of a control: aria-label, else its text. */
export const nameOf = (page: Page, el: Element): string =>
  norm(page.$(el).attr("aria-label") ?? "") || norm(page.$(el).text()) || norm(page.$(el).attr("value") ?? "");
export const controls = (page: Page, pattern: RegExp): Element[] =>
  (page.$("button,a[href],input[type=button],input[type=submit],[role=button]").toArray() as Element[]).filter(
    (el) => pattern.test(nameOf(page, el)) && !inSelectorOrForm(page, el),
  );
export const ADD_PERSON = /^\+?\s*add person$/i;
export const DELETE_PERSON = /^delete\b/i;
export const fileInputs = (page: Page): Element[] => page.$('input[type="file"]').toArray() as Element[];

/** The count next to the "Key People" heading: a bare number inside the heading or inside the heading's own wrapper (one level up). */
export function headingCount(page: Page): { heading: boolean; count: number | null } {
  const head = headings(page).find((h) => /^key people\b/i.test(h.text) && !inSelectorOrForm(page, h.el));
  if (!head) return { heading: false, count: null };
  const inline = /^key people\s+(\d+)$/i.exec(head.text);
  if (inline) return { heading: true, count: Number(inline[1]) };
  const wrapper = head.el.parent as Element | null;
  const found = wrapper ? textNodes(page).find((t) => contains(wrapper, t.node) && /^\d+$/.test(t.text)) : undefined;
  return { heading: true, count: found ? Number(found.text) : null };
}

/** Does an element inside the row show exactly these initials as its own text (an avatar)? */
export const showsInitials = (page: Page, row: Element, initials: string): boolean =>
  page.$(row).find("*").toArray().some((el) => norm(page.$(el).text()) === initials);
