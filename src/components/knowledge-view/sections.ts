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
