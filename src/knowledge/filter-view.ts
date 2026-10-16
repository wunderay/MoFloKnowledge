import type { BusinessEntry, EntryKind } from "../contracts/business";
import type {
  EntryProvenance,
  Origin,
  Assessment,
  ReviewStatus,
} from "../contracts/provenance";
export type ViewEntry = {
  company_id: string;
  entry_id: string;
  kind: EntryKind;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: ReviewStatus;
};
export type ViewFilters = {
  companyId: string;
  query?: string;
  section?: EntryKind;
  origin?: Origin;
  reviewStatus?: ReviewStatus;
  coverage?: Assessment;
};
function searchable(value: unknown): string {
  if (value === null) return "";
  if (Array.isArray(value)) return value.map(searchable).join(" ");
  if (typeof value === "object")
    return Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([, item]) => searchable(item))
      .join(" ");
  return String(value);
}
export function filterView<T extends ViewEntry>(
  entries: T[],
  filters: ViewFilters,
): T[] {
  const query = filters.query?.normalize("NFKC").toLocaleLowerCase().trim();
  return entries.filter(
    (e) =>
      e.company_id === filters.companyId &&
      (!filters.section || e.kind === filters.section) &&
      (!filters.origin ||
        e.provenance.claims.some((c) => c.origin === filters.origin)) &&
      (!filters.reviewStatus || e.review_status === filters.reviewStatus) &&
      (!filters.coverage ||
        e.provenance.coverage.some((c) => c.status === filters.coverage)) &&
      (!query ||
        searchable(e.content)
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(query)),
  );
}
export function resetScopedFilters(companyId: string): ViewFilters {
  return { companyId };
}
