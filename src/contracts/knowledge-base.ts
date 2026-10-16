import { z } from "zod";
import { BusinessSchema } from "./business";
import { UUIDSchema, InstantSchema } from "./primitives";
import { ExportProvenanceSchema } from "./provenance";
import { assertUniqueBusinessIds } from "./stable-pointer";
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
        key_people: v.key_people,
        offerings: v.offerings,
      });
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
    }
  });
export type KnowledgeBaseExport = z.infer<typeof KnowledgeBaseExportSchema>;
