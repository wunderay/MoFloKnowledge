import { z } from "zod";
import { BusinessSchema } from "./business";
import { UUIDSchema, InstantSchema } from "./primitives";
import { ExportProvenanceSchema } from "./provenance";
import { assertUniqueBusinessIds } from "./stable-pointer";
import { storageRefCompany } from "./storage-ref";
export const KnowledgeBaseExportSchema = BusinessSchema.extend({
  schema_version: z.literal("1.0.0"),
  company_id: UUIDSchema,
  knowledge_base_version_id: UUIDSchema,
  version: z.number().int().positive().safe(),
  saved_at: InstantSchema,
  provenance: ExportProvenanceSchema,
})
  .strict()
  .superRefine((v, ctx) => {
    try {
      assertUniqueBusinessIds({
        company_foundation: v.company_foundation,
        positioning: v.positioning,
        market_and_customers: v.market_and_customers,
        branding_and_style: v.branding_and_style,
        online_presence: v.online_presence,
        site_links: v.site_links,
        key_people: v.key_people,
        offerings: v.offerings,
      });
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
    }
    // Storage paths name the owning company; a reference into another company's folder is never valid.
    const refs = [
      ...v.key_people.flatMap((person) => (person.portrait ? [person.portrait] : [])),
      ...v.offerings.flatMap((offering) => offering.images),
    ];
    if (refs.some((ref) => storageRefCompany(ref) !== v.company_id)) {
      ctx.addIssue({
        code: "custom",
        message: "Storage reference belongs to another company",
      });
    }
  });
export type KnowledgeBaseExport = z.infer<typeof KnowledgeBaseExportSchema>;
