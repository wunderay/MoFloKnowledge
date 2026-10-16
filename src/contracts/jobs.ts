import { z } from "zod";
import { UUIDSchema, URLSchema, TextSchema } from "./primitives";
export const JobStatusSchema = z.enum([
  "queued",
  "validating",
  "crawling",
  "extracting",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);
const count = z.number().int().nonnegative().safe();
export const ProgressSchema = z
  .object({
    stage: JobStatusSchema,
    discovered: count,
    selected: count,
    captured: count,
    failed: count,
    blocked: count,
    extracted: count,
    document_limit: count.max(25),
    limits_reached: z.array(TextSchema).max(100),
  })
  .strict();
export const SafeJobErrorSchema = z
  .object({
    code: z.string().min(1).max(100),
    url: URLSchema.nullable(),
    retryable: z.boolean(),
    message: z.string().min(1).max(1000),
  })
  .strict();
export const CheckpointSchema = z
  .object({
    stage: JobStatusSchema,
    frontier: z
      .array(z.object({ url: URLSchema, depth: count.max(3) }).strict())
      .max(200),
    captured_source_ids: z.array(UUIDSchema).max(100),
    extracted_source_ids: z.array(UUIDSchema).max(100),
    budgets: z
      .object({
        documents: count,
        bytes: count,
        rendered_pages: count,
        model_tokens: count,
      })
      .strict(),
    errors: z.array(SafeJobErrorSchema).max(100),
  })
  .strict();
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type Progress = z.infer<typeof ProgressSchema>;
export type SafeJobError = z.infer<typeof SafeJobErrorSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
