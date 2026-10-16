import { z } from "zod";
import { FIELD_REGISTRY, businessEntrySchemas } from "../../contracts";
// Candidate values omit UUIDs. The worker assigns stable identities after local validation.
export function candidateValueSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects)
    return candidateValueSchema(schema.innerType());
  if (schema instanceof z.ZodObject)
    return z
      .object(
        Object.fromEntries(
          Object.entries(schema.shape)
            .filter(([key]) => key !== "id")
            .map(([key, value]) => [
              key,
              candidateValueSchema(value as z.ZodTypeAny),
            ]),
        ),
      )
      .strict();
  if (schema instanceof z.ZodArray)
    return z.array(candidateValueSchema(schema.element)).max(100);
  if (schema instanceof z.ZodNullable)
    return candidateValueSchema(schema.unwrap()).nullable();
  if (schema instanceof z.ZodOptional)
    return candidateValueSchema(schema.unwrap()).nullable();
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
      priority: z.number().int().min(0).max(100).optional(),
      entity_key: z.string().max(300).nullable(),
      value: candidateValueSchema(
        objectSchema(businessEntrySchemas[field.kind]).shape[field.field],
      ),
      origin: z.literal("source_backed"),
      segment_ids: z.array(z.string().max(200)).max(30),
      observation_ids: z.array(z.string().max(200)).max(30),
      supporting_fields: z.array(z.string().max(500)).max(30),
      note: z.string().max(2000).nullable(),
    })
    .strict(),
);
