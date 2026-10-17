import { z } from "zod";
import { NullableTextSchema, TextSchema, URLSchema, UUIDSchema, collection } from "./primitives";
export const SiteLinkSchema = z
  .object({
    id: UUIDSchema,
    title: TextSchema,
    url: URLSchema,
    note: NullableTextSchema,
  })
  .strict();
export const SiteLinksSchema = z
  .object({ links: collection(SiteLinkSchema) })
  .strict();
export type SiteLink = z.infer<typeof SiteLinkSchema>;
export type SiteLinks = z.infer<typeof SiteLinksSchema>;
