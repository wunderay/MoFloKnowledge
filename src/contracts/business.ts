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
/**
 * Reads stored content. Revisions are immutable history, so one saved before a field existed omits it: the missing
 * fields read as their defaults. New writes use parseBusinessEntry, which stays strict.
 */
export function parseStoredEntry(kind: EntryKind, content: unknown): BusinessEntry {
  const complete =
    content && typeof content === "object" && !Array.isArray(content)
      ? { ...createEntryDefault(kind), ...content }
      : content;
  return parseBusinessEntry(kind, complete);
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
