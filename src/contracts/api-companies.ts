import { z } from "zod";
import { IdSchema, GenerationSchema } from "./api-common";
export const WebsiteSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      (!u.port || ["80", "443"].includes(u.port))
    );
  }, "Use a public HTTP(S) website URL.");
export const CreateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    website: WebsiteSchema,
    requestId: IdSchema,
  })
  .strict();
export const UpdateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    website: WebsiteSchema.optional(),
    expectedGeneration: GenerationSchema,
  })
  .strict()
  .refine((v) => v.name !== undefined || v.website !== undefined);
export const ArchiveCompanySchema = z
  .object({ expectedGeneration: GenerationSchema })
  .strict();
export const MemberSchema = z.union([
  z.object({ role: z.enum(["owner", "editor", "viewer"]) }).strict(),
  z.object({ remove: z.literal(true) }).strict(),
]);
