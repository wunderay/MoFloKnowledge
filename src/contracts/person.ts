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

/** Claim note of a gender read from the pronouns a site uses for the person in their own bio. */
export const PRONOUN_GENDER_NOTE = "Third-person pronouns in the person's own bio.";
/** Female or Male when the text refers to one person with only she/her or only he/him/his; otherwise null. */
export function pronounGender(text: string): "Female" | "Male" | null {
  const female = /\b(?:she|her|hers|herself)\b/i.test(text), male = /\b(?:he|him|his|himself)\b/i.test(text);
  return female === male ? null : female ? "Female" : "Male";
}
