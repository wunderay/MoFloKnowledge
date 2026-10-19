// The sections of /knowledge/view, in the order of the MoFlo Cloud reference. Shared by
// the server page (which reads the `section` URL parameter) and the client viewer.
export const KNOWLEDGE_SECTIONS = [
  { id: "general", label: "General Info" },
  { id: "brand", label: "Brand Identity" },
  { id: "offerings", label: "Business Offerings" },
  { id: "customers", label: "Customers & Industry" },
  { id: "sales", label: "Sales & Marketing" },
  { id: "key-people", label: "Key People" },
  { id: "site", label: "Site Knowledge" },
  { id: "all", label: "All sections" },
] as const;
export type KnowledgeSectionId = (typeof KNOWLEDGE_SECTIONS)[number]["id"];

/** An unknown or missing URL value selects General Info. */
export function parseSection(value: unknown): KnowledgeSectionId {
  return KNOWLEDGE_SECTIONS.find((section) => section.id === value)?.id ?? "general";
}

/** The label a section is shown with. */
export function sectionLabel(id: KnowledgeSectionId): string {
  return KNOWLEDGE_SECTIONS.find((section) => section.id === id)?.label ?? "General Info";
}

/** The section that shows an entry kind; links from before the hub name a kind (`category`) instead of a section. */
const KIND_SECTIONS: Record<string, KnowledgeSectionId> = {
  company_foundation: "general",
  positioning: "general",
  market_and_customers: "customers",
  online_presence: "sales",
  branding_and_style: "brand",
  offering: "offerings",
  key_person: "key-people",
  site_links: "site",
};
export function sectionOfKind(kind: unknown): KnowledgeSectionId | null {
  return typeof kind === "string" && Object.hasOwn(KIND_SECTIONS, kind) ? KIND_SECTIONS[kind] : null;
}
