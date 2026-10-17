import {
  createEmptyBusiness,
  createEmptyProvenance,
  type Address,
  type Assessment,
  type BusinessEntry,
  type CitationContext,
  type CoverageAssessment,
  type EntryProvenance,
  type ReviewStatus,
  type CompanyFoundation,
  type EmployeeCount,
  type EntryKind,
  type MarketAndCustomers,
  type OnlinePresence,
  type Positioning,
  type SocialLink,
} from "@/contracts";

/** What backs a section's values: its provenance, review state and the draft's citation lookup. */
export type Evidence = {
  provenance: EntryProvenance;
  approved: boolean;
  citationContext?: CitationContext;
};
export type ViewProfile = {
  foundation: CompanyFoundation;
  positioning: Positioning;
  market: MarketAndCustomers;
  presence: OnlinePresence;
  evidence: { foundation: Evidence; positioning: Evidence; market: Evidence; presence: Evidence };
};

/**
 * The single-entry sections the view reads, from a draft's entries or a saved
 * snapshot's. A section with no entry shows the same empty defaults as a blank one.
 */
export function profileFrom(
  entries: { kind: EntryKind; content: BusinessEntry; provenance: EntryProvenance; review_status: ReviewStatus }[],
  citationContext?: CitationContext,
): ViewProfile {
  const empty = createEmptyBusiness();
  const pick = <K extends "company_foundation" | "positioning" | "market_and_customers" | "online_presence">(kind: K) => {
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
  return {
    foundation: foundation.content,
    positioning: positioning.content,
    market: market.content,
    presence: presence.content,
    evidence: {
      foundation: foundation.evidence,
      positioning: positioning.evidence,
      market: market.evidence,
      presence: presence.evidence,
    },
  };
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
  if (raw) return raw;
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
  if (!count) return null;
  const raw = textOrNull(count.raw);
  if (raw) return raw;
  if (count.exact !== null) return String(count.exact);
  if (count.min !== null || count.max !== null) return `${count.min ?? ""}–${count.max ?? ""}`;
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
