import { z } from "zod";
import {
  UUIDSchema as id,
  TextSchema as text,
  NullableTextSchema as nullable,
  URLSchema as url,
  DateOnlySchema as date,
  collection,
} from "./primitives";
export const IdentifiedTextSchema = z.object({ id, text }).strict();
export const AddressSchema = z
  .object({
    id,
    label: nullable,
    raw: nullable,
    line1: nullable,
    line2: nullable,
    city: nullable,
    region: nullable,
    postal_code: nullable,
    country: nullable,
  })
  .strict();
export const PersonaSchema = z
  .object({
    id,
    name: nullable,
    role: nullable,
    organization_type: nullable,
    goals: collection(IdentifiedTextSchema),
    pain_points: collection(IdentifiedTextSchema),
  })
  .strict();
export const PartnerSchema = z
  .object({
    id,
    name: nullable,
    relationship_type: nullable,
    relationship_text: nullable,
    url: url.nullable(),
  })
  .strict();
export const CommentarySchema = z
  .object({ id, text, publisher: nullable, published_on: date.nullable() })
  .strict();
export const ChannelSchema = z
  .object({ id, channel_type: nullable, label: nullable, url: url.nullable() })
  .strict();
export const FunnelSchema = z
  .object({
    id,
    name: nullable,
    steps: collection(
      z.object({ id, label: text, url: url.nullable() }).strict(),
    ),
  })
  .strict();
export const CTASchema = z
  .object({ id, label: text, url: url.nullable(), purpose: nullable })
  .strict();
export const FontSchema = z
  .object({
    id,
    family: text,
    apparent_use: nullable,
    observations: z
      .array(z.enum(["css_declared", "resource_loaded", "computed_family"]))
      .max(3)
      .refine(
        (v) =>
          new Set(v).size === v.length && v.join() === [...v].sort().join(),
        "Observation methods must be unique and sorted",
      ),
    brand_confirmed: z.boolean(),
  })
  .strict();
export const ColorSchema = z
  .object({
    id,
    hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    alpha: z.number().min(0).max(1),
    apparent_role: nullable,
    classification: z.enum(["observed_website_color", "brand_guide_confirmed"]),
  })
  .strict();
export const LogoSchema = z
  .object({ id, url, variant: nullable, kind: z.literal("company_logo") })
  .strict();
export const SocialLinkSchema = z
  .object({
    id,
    platform: text,
    profile_url: url.refine(
      (value) =>
        !/(?:^|\/)(?:share|sharer(?:\.php)?|intent)(?:\/|$|\?)/i.test(
          new URL(value).pathname,
        ),
      "Expected company profile, not share/intent link",
    ),
  })
  .strict();
export type IdentifiedText = z.infer<typeof IdentifiedTextSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type Partner = z.infer<typeof PartnerSchema>;
export type Commentary = z.infer<typeof CommentarySchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type Funnel = z.infer<typeof FunnelSchema>;
export type CTA = z.infer<typeof CTASchema>;
export type Font = z.infer<typeof FontSchema>;
export type Color = z.infer<typeof ColorSchema>;
export type Logo = z.infer<typeof LogoSchema>;
export type SocialLink = z.infer<typeof SocialLinkSchema>;
