import { z } from "zod";
import { IdSchema } from "./api-common";
import { InstantSchema, URLSchema } from "./primitives";
import { crawlLimits } from "../lib/config/crawl-limits";
import { JobStatusSchema, ProgressSchema, SafeJobErrorSchema } from "./jobs";

const captureStatus = z.enum(["captured", "failed", "blocked", "unsupported"]);
export const SourceCoverageSchema = z.object({
  job: z.object({
    id: IdSchema,
    status: JobStatusSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    documentLimit: z.number().int().min(1).max(crawlLimits().maxPages),
    progress: ProgressSchema,
    limitsReached: z.array(z.string()).max(100),
    errors: z.array(SafeJobErrorSchema).max(200),
  }).strict().nullable(),
  pages: z.array(z.object({
    sourceId: IdSchema.nullable(),
    url: URLSchema,
    title: z.string().nullable(),
    state: z.enum(["captured", "failed", "blocked", "unsupported", "pending", "linked_not_selected", "selected_no_capture"]),
    selected: z.boolean().nullable(),
    retrievedAt: InstantSchema.nullable(),
    reason: z.string().nullable(),
    score: z.number().int().nonnegative().nullable(),
    depth: z.number().int().min(0).max(crawlLimits().maxDepth).nullable(),
  }).strict()).max(1000),
}).strict();
export type SourceCoverage = z.infer<typeof SourceCoverageSchema>;

/** Full retained plain text, not raw HTML or a promise of an unbounded live capture. */
export const SourceCaptureSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  url: URLSchema,
  title: z.string().nullable(),
  capturedAt: InstantSchema.nullable(),
  captureStatus,
  text: z.string().max(100000),
  segments: z.array(z.object({ id: z.string(), text: z.string(), heading: z.string().optional() }).strict()).max(10000),
  truncated: z.boolean(),
  limitations: z.array(z.string()).max(1000),
}).strict();
export type SourceCapture = z.infer<typeof SourceCaptureSchema>;
