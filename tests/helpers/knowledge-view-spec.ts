// The Quest's criteria as data, plus the shared "open a section" helper.
import { expect } from "vitest";
import { renderViewPage, type RenderOptions } from "./knowledge-view-render";
import { buildDraft, VERSIONS } from "./knowledge-view-fixtures";
import { parse, selectorItems, type Page } from "./knowledge-view-dom";
import type { EntryKind } from "../../src/contracts";

export const SECTIONS = [
  "General Info",
  "Brand Identity",
  "Business Offerings",
  "Customers & Industry",
  "Sales & Marketing",
  "Key People",
  "Site Knowledge",
  "All sections",
] as const;
export type SectionLabel = (typeof SECTIONS)[number];
/** Sections built after the selector Quest. Only their selection is checked with this list; each has its own tests for its content. */
export const LATER_SECTIONS: SectionLabel[] = [
  "Business Offerings",
  "Brand Identity",
  "Key People",
  "Site Knowledge",
  "All sections",
];

type Card = { title: string; kind: EntryKind };
export const GENERAL_CARDS: Card[] = [
  { title: "Headquarters", kind: "company_foundation" },
  { title: "Alternate names", kind: "company_foundation" },
  { title: "Overview", kind: "company_foundation" },
  { title: "Founding story", kind: "positioning" },
];
export const CUSTOMER_CARDS: Card[] = [
  { title: "Business model", kind: "company_foundation" },
  { title: "Company role", kind: "company_foundation" },
  { title: "Industry outlook", kind: "market_and_customers" },
  { title: "Industry groupings", kind: "market_and_customers" },
  { title: "Service locations", kind: "company_foundation" },
  { title: "Buyers", kind: "market_and_customers" },
  { title: "Suppliers", kind: "market_and_customers" },
];
export const SALES_CARDS: Card[] = [
  { title: "Pitch", kind: "positioning" },
  { title: "Ideal persona", kind: "market_and_customers" },
  { title: "Customer needs", kind: "market_and_customers" },
  { title: "Channels", kind: "market_and_customers" },
  { title: "Calls to action", kind: "market_and_customers" },
  { title: "Funnels", kind: "market_and_customers" },
];
export const CARDS_BY_SECTION = {
  "General Info": GENERAL_CARDS,
  "Customers & Industry": CUSTOMER_CARDS,
  "Sales & Marketing": SALES_CARDS,
} as const;
export type LockedSection = keyof typeof CARDS_BY_SECTION;
export const LOCKED_SECTIONS = Object.keys(CARDS_BY_SECTION) as LockedSection[];
export const titlesOf = (section: LockedSection) =>
  CARDS_BY_SECTION[section].map((c) => c.title);

export const GENERAL_STATS = ["Founded", "Employees", "Legal entity"];
export const CUSTOMER_STATS = ["Groupings", "Locations", "Buyers", "Suppliers"];

export const BANNER_LABEL: Record<LockedSection, string> = {
  "General Info": "Company",
  "Customers & Industry": "Industry",
  "Sales & Marketing": "Sales & Marketing",
};

/**
 * The URL identifier the selector submits for a section. The Quest fixes the
 * selector's labels and order but not its identifiers, so they are read from
 * the rendered selector rather than assumed.
 */
export async function sectionId(label: SectionLabel): Promise<string> {
  const page = parse(await renderViewPage({ draft: buildDraft(), versions: VERSIONS }));
  const option = selectorItems(page).find((item) => item.label === label);
  expect(option, `the "Knowledge section" selector should list "${label}"`).toBeDefined();
  expect(
    option!.value,
    `"${label}" should carry an identifier (option value or link ?section=) for the URL parameter`,
  ).not.toBe("");
  return option!.value;
}

/** Render /knowledge/view with the given section selected via the URL parameter. */
export async function openSection(
  label: SectionLabel,
  opts: Omit<RenderOptions, "section"> = {},
): Promise<Page> {
  const section = await sectionId(label);
  return parse(
    await renderViewPage({
      draft: opts.snapshot ? undefined : buildDraft(),
      versions: VERSIONS,
      ...opts,
      section,
    }),
  );
}
