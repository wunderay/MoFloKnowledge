import { z } from "zod";
import { collection } from "./primitives";
import { createEntryDefault } from "./defaults";
import { CompanyFoundationSchema } from "./company-foundation";
import { PositioningSchema } from "./positioning";
import { MarketAndCustomersSchema } from "./market-and-customers";
import { BrandingAndStyleSchema } from "./branding-and-style";
import { OnlinePresenceSchema } from "./online-presence";
import { SiteLinksSchema } from "./site-links";
import { PersonSchema } from "./person";
import { OfferingSchema } from "./offering";
export const EntryKindSchema = z.enum([
  "company_foundation",
  "positioning",
  "market_and_customers",
  "branding_and_style",
  "online_presence",
  "site_links",
  "key_person",
  "offering",
]);
export type EntryKind = z.infer<typeof EntryKindSchema>;
export const businessEntrySchemas = {
  company_foundation: CompanyFoundationSchema,
  positioning: PositioningSchema,
  market_and_customers: MarketAndCustomersSchema,
  branding_and_style: BrandingAndStyleSchema,
  online_presence: OnlinePresenceSchema,
  site_links: SiteLinksSchema,
  key_person: PersonSchema,
  offering: OfferingSchema,
} as const;
export const BusinessEntrySchema = z.union([
  CompanyFoundationSchema,
  PositioningSchema,
  MarketAndCustomersSchema,
  BrandingAndStyleSchema,
  OnlinePresenceSchema,
  SiteLinksSchema,
  PersonSchema,
  OfferingSchema,
]);
export type BusinessEntry = z.infer<typeof BusinessEntrySchema>;
export function parseBusinessEntry(
  kind: EntryKind,
  content: unknown,
): BusinessEntry {
  return businessEntrySchemas[kind].parse(content);
}
/** Fields added after the first release; content stored before they existed omits them and reads them as defaults. */
export const ADDED_FIELDS: Partial<Record<EntryKind, string[]>> = {
  company_foundation: ["revenue"],
  online_presence: ["phone"],
  key_person: ["age", "nationality", "portrait"],
  offering: ["images"],
};
/** The content with its missing added fields at their defaults; every stored field keeps its place and value. */
export function withAddedFields(kind: EntryKind, content: unknown): unknown {
  if (!content || typeof content !== "object" || Array.isArray(content))
    return content;
  const defaults = createEntryDefault(kind) as unknown as Record<string, unknown>;
  const missing = (ADDED_FIELDS[kind] ?? []).filter(
    (field) => !Object.hasOwn(content, field),
  );
  return {
    ...content,
    ...Object.fromEntries(missing.map((field) => [field, defaults[field]])),
  };
}
/**
 * Reads stored content. Revisions are immutable history, so one saved before an added field existed omits it: only
 * those fields read as their defaults. New writes use parseBusinessEntry, which stays strict.
 */
export function parseStoredEntry(kind: EntryKind, content: unknown): BusinessEntry {
  return parseBusinessEntry(kind, withAddedFields(kind, content));
}
export const BusinessSchema = z
  .object({
    company_foundation: CompanyFoundationSchema,
    positioning: PositioningSchema,
    market_and_customers: MarketAndCustomersSchema,
    branding_and_style: BrandingAndStyleSchema,
    online_presence: OnlinePresenceSchema,
    site_links: SiteLinksSchema,
    key_people: collection(PersonSchema),
    offerings: collection(OfferingSchema),
  })
  .strict();
export type Business = z.infer<typeof BusinessSchema>;
export function entryRoot(kind: EntryKind, id: string): string {
  return kind === "key_person"
    ? `/key_people/@${id}`
    : kind === "offering"
      ? `/offerings/@${id}`
      : `/${kind}`;
}
export function entryBusiness(
  kind: EntryKind,
  content: BusinessEntry,
): Record<string, unknown> {
  return kind === "key_person"
    ? { key_people: [content] }
    : kind === "offering"
      ? { offerings: [content] }
      : { [kind]: content };
}
