import { z } from "zod";
import { ClaimSchema, EvidenceSchema, SourceSchema } from "./provenance";
/** Company-scoped read-only lookup context. It is never entry provenance or write authority. */
export const CitationContextSchema = z
  .object({
    claims: z
      .array(ClaimSchema)
      .max(10000)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Citation claim IDs must be unique",
      ),
    evidence: z
      .array(EvidenceSchema)
      .max(10000)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Citation evidence IDs must be unique",
      ),
    sources: z
      .array(SourceSchema)
      .max(10000)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Citation source IDs must be unique",
      ),
  })
  .strict();
export type CitationContext = z.infer<typeof CitationContextSchema>;
