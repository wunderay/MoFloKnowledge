import { z } from "zod";
import { UUIDSchema, URLSchema, TextSchema } from "./primitives";
import { EntryKindSchema } from "./business";
import { FIELD_REGISTRY } from "./field-registry";
import { JSONValueSchema } from "./provenance";
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
/** Durable wire shapes emitted by Frontier.snapshot(), CrawlBudgets.snapshot() and extraction pipeline. */
export const FrontierSnapshotSchema = z
  .object({
    root: URLSchema,
    pending: z
      .array(
        z
          .object({ url: URLSchema, depth: count.max(3), score: count })
          .strict(),
      )
      .max(200),
    seen: z.array(URLSchema).max(225),
    aliases: z.array(z.tuple([URLSchema, URLSchema])).max(25),
    selected: count.max(25),
    limitsReached: z.array(TextSchema).max(100),
  })
  .strict();
export const CrawlBudgetSnapshotSchema = z
  .object({
    documents: count.max(25),
    htmlBytes: count.max(25 * 2 * 1024 * 1024),
    designBytes: count.max(15 * 1024 * 1024),
    startedAt: count,
    limitsReached: z.array(TextSchema).max(100),
  })
  .strict();
export const CheckpointCandidateSchema = z
  .object({
    id: UUIDSchema,
    priority: z.number().int().min(0).max(100).optional(),
    kind: EntryKindSchema,
    field: z.enum(
      FIELD_REGISTRY.map((field) => field.path) as [string, ...string[]],
    ),
    fieldName: z
      .string()
      .regex(/^[a-z_]+$/)
      .max(100),
    entryId: UUIDSchema,
    sourceId: UUIDSchema,
    entity_key: z.string().max(300).nullable(),
    value: JSONValueSchema,
    origin: z.enum(["source_backed", "inferred", "generated"]),
    segment_ids: z.array(z.string().max(200)).max(30),
    observation_ids: z.array(z.string().max(200)).max(30),
    supporting_fields: z.array(z.string().max(500)).max(30),
    note: z.string().max(2000).nullable(),
    evidenceIds: z.array(UUIDSchema).max(60),
  })
  .strict();
export const CrawlCheckpointSchema = z
  .object({
    stage: JobStatusSchema.optional(),
    effectiveRoot: URLSchema.optional(),
    frontier: FrontierSnapshotSchema,
    budgets: CrawlBudgetSnapshotSchema,
    captured_source_ids: z.array(UUIDSchema).max(25),
    extracted_source_ids: z.array(UUIDSchema).max(25).optional(),
    extractor_version: z.string().min(1).max(100).optional(),
    errors: z.array(SafeJobErrorSchema).max(200),
    model_tokens: count.max(120000).optional(),
    model_successes: count.max(25).optional(),
    model_failures: count.max(25).optional(),
    validated_candidates: z
      .array(CheckpointCandidateSchema)
      .max(5000)
      .optional(),
  })
  .strict();
export const CheckpointSchema = z
  .union([z.object({}).strict(), CrawlCheckpointSchema])
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= 1048576,
    "Checkpoint exceeds 1 MiB",
  );
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type Progress = z.infer<typeof ProgressSchema>;
export type SafeJobError = z.infer<typeof SafeJobErrorSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
