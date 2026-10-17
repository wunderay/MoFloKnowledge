// The sections of /knowledge/view, in selector order. Shared by the server
// page (which reads the `section` URL parameter) and the client viewer.
export const KNOWLEDGE_SECTIONS = [
  { id: "general", label: "General Info" },
  { id: "customers", label: "Customers & Industry" },
  { id: "sales", label: "Sales & Marketing" },
  { id: "offerings", label: "Business Offerings" },
  { id: "brand", label: "Brand Identity" },
  { id: "site", label: "Site Knowledge" },
  { id: "all", label: "All sections" },
] as const;
export type KnowledgeSectionId = (typeof KNOWLEDGE_SECTIONS)[number]["id"];

/** An unknown or missing URL value selects General Info. */
export function parseSection(value: unknown): KnowledgeSectionId {
  return KNOWLEDGE_SECTIONS.find((section) => section.id === value)?.id ?? "general";
}
