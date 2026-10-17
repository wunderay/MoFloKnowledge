import {
  createEmptyBusiness,
  type Address,
  type BusinessEntry,
  type CompanyFoundation,
  type EmployeeCount,
  type EntryKind,
  type MarketAndCustomers,
  type OnlinePresence,
  type Positioning,
  type SocialLink,
} from "@/contracts";

export type ViewProfile = {
  foundation: CompanyFoundation;
  positioning: Positioning;
  market: MarketAndCustomers;
  presence: OnlinePresence;
};

/**
 * The single-entry sections the view reads, from a draft's entries or a saved
 * snapshot's. A section with no entry shows the same empty defaults as a blank one.
 */
export function profileFrom(entries: { kind: EntryKind; content: BusinessEntry }[]): ViewProfile {
  const empty = createEmptyBusiness();
  const content = <K extends "company_foundation" | "positioning" | "market_and_customers" | "online_presence">(kind: K) =>
    (entries.find((entry) => entry.kind === kind)?.content ?? empty[kind]) as (typeof empty)[K];
  return {
    foundation: content("company_foundation"),
    positioning: content("positioning"),
    market: content("market_and_customers"),
    presence: content("online_presence"),
  };
}

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
