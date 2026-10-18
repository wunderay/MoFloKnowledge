import {
  createEmptyBusiness,
  createEmptyProvenance,
  type Address,
  type Assessment,
  type BrandingAndStyle,
  type BusinessEntry,
  type CitationContext,
  type CoverageAssessment,
  type EntryProvenance,
  type ReviewStatus,
  type CompanyFoundation,
  type EmployeeCount,
  type EntryKind,
  type MarketAndCustomers,
  type Offering,
  type OnlinePresence,
  type Person,
  type Positioning,
  type SiteLink,
  type SiteLinks,
  type SocialLink,
} from "@/contracts";

/** What backs a section's values: its provenance, review state and the draft's citation lookup. */
export interface Evidence {
  provenance: EntryProvenance;
  approved: boolean;
  citationContext?: CitationContext;
}
export interface ViewProfile {
  foundation: CompanyFoundation;
  positioning: Positioning;
  market: MarketAndCustomers;
  presence: OnlinePresence;
  branding: BrandingAndStyle;
  evidence: { foundation: Evidence; positioning: Evidence; market: Evidence; presence: Evidence; branding: Evidence };
}
/** One offering entry, with what backs its values and, for an editable draft, the entry to revise or delete (as ViewPerson). */
export interface ViewOffering { offering: Offering; evidence: Evidence; entryId: string; revision: number }

/**
 * The single-entry sections the view reads, from a draft's entries or a saved
 * snapshot's. A section with no entry shows the same empty defaults as a blank one.
 */
export function profileFrom(
  entries: { kind: EntryKind; content: BusinessEntry; provenance: EntryProvenance; review_status: ReviewStatus }[],
  citationContext?: CitationContext,
): ViewProfile {
  const empty = createEmptyBusiness();
  const pick = <
    K extends "company_foundation" | "positioning" | "market_and_customers" | "online_presence" | "branding_and_style",
  >(
    kind: K,
  ) => {
    const entry = entries.find((item) => item.kind === kind);
    return {
      content: (entry?.content ?? empty[kind]) as (typeof empty)[K],
      evidence: {
        provenance: entry?.provenance ?? createEmptyProvenance(),
        approved: entry?.review_status === "approved",
        citationContext,
      },
    };
  };
  const foundation = pick("company_foundation");
  const positioning = pick("positioning");
  const market = pick("market_and_customers");
  const presence = pick("online_presence");
  const branding = pick("branding_and_style");
  return {
    foundation: foundation.content,
    positioning: positioning.content,
    market: market.content,
    presence: presence.content,
    branding: branding.content,
    evidence: {
      foundation: foundation.evidence,
      positioning: positioning.evidence,
      market: market.evidence,
      presence: presence.evidence,
      branding: branding.evidence,
    },
  };
}

/** The site_links entry as the view needs it: its links, what backs them, and enough of the entry to revise it. */
export interface ViewSiteLinks {
  links: SiteLink[];
  evidence: Evidence;
  /** The stored entry of an editable draft; null when the company has none yet. */
  entry: { id: string; revision: number; content: SiteLinks; provenance: EntryProvenance } | null;
}

export function siteLinksFrom(
  entries: {
    id?: string;
    current_revision?: number;
    kind: EntryKind;
    content: BusinessEntry;
    provenance: EntryProvenance;
    review_status: ReviewStatus;
  }[],
  citationContext?: CitationContext,
): ViewSiteLinks {
  const found = entries.find((item) => item.kind === "site_links");
  const content = found?.content as SiteLinks | undefined;
  return {
    links: content?.links ?? [],
    evidence: {
      provenance: found?.provenance ?? createEmptyProvenance(),
      approved: found?.review_status === "approved",
      citationContext,
    },
    entry:
      found?.id !== undefined && content
        ? { id: found.id, revision: found.current_revision ?? 0, content, provenance: found.provenance }
        : null,
  };
}

/** The offering entries, in the order the draft or snapshot lists them, each with its own evidence. */
export function offeringsFrom(
  entries: { id?: string; current_revision?: number; kind: EntryKind; content: BusinessEntry; provenance: EntryProvenance; review_status: ReviewStatus }[],
  citationContext?: CitationContext,
): ViewOffering[] {
  return entries
    .filter((entry) => entry.kind === "offering")
    .map((entry) => ({
      offering: entry.content as Offering,
      evidence: { provenance: entry.provenance, approved: entry.review_status === "approved", citationContext },
      entryId: entry.id ?? (entry.content as Offering).id,
      revision: entry.current_revision ?? 0,
    }));
}

/**
 * One key person, with what backs their values and, for an editable draft, the entry to revise or delete.
 * `entryId` and `revision` come from the stored entry; a saved snapshot has no use for them.
 */
export interface ViewPerson { person: Person; evidence: Evidence; entryId: string; revision: number }

/** The key person entries, in the order the draft or snapshot lists them, each with its own evidence. */
export function peopleFrom(
  entries: { id?: string; current_revision?: number; kind: EntryKind; content: BusinessEntry; provenance: EntryProvenance; review_status: ReviewStatus }[],
  citationContext?: CitationContext,
): ViewPerson[] {
  return entries
    .filter((entry) => entry.kind === "key_person")
    .map((entry) => ({
      person: entry.content as Person,
      evidence: { provenance: entry.provenance, approved: entry.review_status === "approved", citationContext },
      entryId: entry.id ?? (entry.content as Person).id,
      revision: entry.current_revision ?? 0,
    }));
}

/** Up to two capital letters for a person's avatar: the first letters of the first and last words of the name. */
export function initialsOf(name: string | null): string {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- spreading a string by code point is intended (no grapheme splitting needed)
  const words = (name ?? "").split(/\s+/).map((word) => [...word.replace(/[^\p{L}\p{N}]/gu, "")][0]).filter(Boolean);
  if (words.length === 0) {
    return "";
  }
  return (words.length === 1 ? words[0] : words[0] + words[words.length - 1]).toUpperCase();
}

const under = (target: string, path: string) => target === path || target.startsWith(`${path}/`);

/**
 * The provenance as seen from one field: claims about its items or parts
 * (".../@id/text", ".../raw") count as claims about the field, so one source
 * control covers the field's whole value.
 */
export function fieldProvenance(provenance: EntryProvenance, path: string): EntryProvenance {
  return {
    ...provenance,
    claims: provenance.claims.map((claim) => ({
      ...claim,
      targets: [...new Set(claim.targets.map((target) => (under(target, path) ? path : target)))],
    })),
  };
}

/** The coverage assessment recorded for a field, if any. */
export const coverageFor = (provenance: EntryProvenance, path: string): CoverageAssessment | undefined =>
  provenance.coverage.find((item) => item.targets.some((target) => path === target || path.startsWith(`${target}/`)));

export function hasClaim(provenance: EntryProvenance, path: string): boolean {
  return provenance.claims.some((claim) => claim.targets.some((target) => under(target, path)));
}

/** True when an item's own claims include user corrections or historical generated/inferred wording. */
export function hasMarkedOrigin(provenance: EntryProvenance, itemPath: string): boolean {
  return provenance.claims.some(
    (claim) => claim.origin !== "source_backed" && claim.targets.some((target) => under(target, itemPath)),
  );
}

const COVERAGE_LABELS: Partial<Record<Assessment, string>> = {
  partial: "Partial",
  conflict: "Conflicting sources",
  not_found: "Not found in checked pages",
  found: "Unknown",
};
export const coverageLabel = (status: Assessment | undefined) =>
  (status && COVERAGE_LABELS[status]) || "Unknown · Not assessed";

/** Trimmed text, or null when there is nothing to show. */
export const textOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

export function addressText(address: Address): string | null {
  const raw = textOrNull(address.raw);
  if (raw) {
    return raw;
  }
  const locality = [address.city, [address.region, address.postal_code].map(textOrNull).filter(Boolean).join(" ")]
    .map((part) => textOrNull(part))
    .filter(Boolean)
    .join(", ");
  return (
    [address.line1, address.line2, locality, address.country]
      .map((part) => textOrNull(part))
      .filter(Boolean)
      .join(", ") || null
  );
}

export function employeeText(count: EmployeeCount | null): string | null {
  if (!count) {
    return null;
  }
  const raw = textOrNull(count.raw);
  if (raw) {
    return raw;
  }
  if (count.exact !== null) {
    return String(count.exact);
  }
  if (count.min !== null || count.max !== null) {
    return `${count.min ?? ""}–${count.max ?? ""}`;
  }
  return null;
}

/** The handle shown for a social link: the last path segment of its profile URL. */
export function socialHandle(link: SocialLink): string {
  try {
    const segments = new URL(link.profile_url).pathname.split("/").filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] ?? "").replace(/^@/, "") || link.profile_url;
  } catch {
    return link.profile_url;
  }
}
