import { z } from "zod";
import { UUIDSchema, NullableTextSchema as text } from "./primitives";
import { PortraitSchema } from "./storage-ref";
export const PersonSchema = z
  .object({
    id: UUIDSchema,
    name: text,
    title: text,
    role: text,
    gender: text,
    background_or_relevance: text,
    age: z.number().int().min(0).max(150).nullable(),
    nationality: text,
    portrait: PortraitSchema.nullable(),
  })
  .strict()
  .refine(
    (v) => Object.entries(v).some(([k, x]) => k !== "id" && x !== null),
    "Cannot create wholly empty person",
  );
export type Person = z.infer<typeof PersonSchema>;
