import { z } from "zod";
import { FIELD_REGISTRY, businessEntrySchemas } from "../../contracts";
// Model values omit all UUIDs. The worker assigns stable identities after local validation.
export function modelValueSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects)
    return modelValueSchema(schema.innerType());
  if (schema instanceof z.ZodObject)
    return z
      .object(
        Object.fromEntries(
          Object.entries(schema.shape)
            .filter(([key]) => key !== "id")
            .map(([key, value]) => [
              key,
              modelValueSchema(value as z.ZodTypeAny),
            ]),
        ),
      )
      .strict();
  if (schema instanceof z.ZodArray)
    return z.array(modelValueSchema(schema.element)).max(100);
  if (schema instanceof z.ZodNullable)
    return modelValueSchema(schema.unwrap()).nullable();
  if (schema instanceof z.ZodOptional)
    return modelValueSchema(schema.unwrap()).nullable();
  return schema;
}
function objectSchema(schema: z.ZodTypeAny): z.AnyZodObject {
  while (schema instanceof z.ZodEffects) schema = schema.innerType();
  if (!(schema instanceof z.ZodObject))
    throw new Error("Expected object contract");
  return schema;
}
export const fieldCandidateSchemas = FIELD_REGISTRY.map((field) =>
  z
    .object({
      field: z.literal(field.path),
      entity_key: z.string().max(300).nullable(),
      value: modelValueSchema(
        objectSchema(businessEntrySchemas[field.kind]).shape[field.field],
      ),
      origin: z.enum(["source_backed", "inferred", "generated"]),
      segment_ids: z.array(z.string().max(200)).max(30),
      observation_ids: z.array(z.string().max(200)).max(30),
      supporting_fields: z.array(z.string().max(500)).max(30),
      note: z.string().max(2000).nullable(),
    })
    .strict(),
);
export const PageModelOutputSchema = z
  .object({
    candidates: z
      .array(
        z.union(
          fieldCandidateSchemas as unknown as [
            z.ZodTypeAny,
            z.ZodTypeAny,
            ...z.ZodTypeAny[],
          ],
        ),
      )
      .max(200),
    limitations: z.array(z.string().max(500)).max(100),
  })
  .strict();
export type FieldCandidate = {
  field: string;
  entity_key: string | null;
  value: unknown;
  origin: "source_backed" | "inferred" | "generated";
  segment_ids: string[];
  observation_ids: string[];
  supporting_fields: string[];
  note: string | null;
};
export type PageModelOutput = {
  candidates: FieldCandidate[];
  limitations: string[];
};
