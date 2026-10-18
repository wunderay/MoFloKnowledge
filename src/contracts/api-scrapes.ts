import { z } from "zod";
import { IdSchema } from "./api-common";
import { WebsiteSchema } from "./api-companies";
import { crawlLimits } from "../lib/config/crawl-limits";
const limits = crawlLimits();
export const EnqueueSchema = z
  .object({
    url: WebsiteSchema,
    options: z
      .object({
        documentLimit: z.number().int().min(1).max(limits.maxPages).optional(),
        depthLimit: z.number().int().min(0).max(limits.maxDepth).optional(),
      })
      .strict()
      .optional(),
    requestId: IdSchema,
  })
  .strict();
export const ApplyProposalSchema = z
  .object({
    jobId: IdSchema,
    entryId: IdSchema.optional(),
    expectedRevision: z.number().int().positive().optional(),
    selectedCandidateIds: z.array(IdSchema).max(1000),
    requestId: IdSchema,
  })
  .strict();
export const DismissProposalSchema = z
  .object({ jobId: IdSchema, reason: z.string().max(2000).optional() })
  .strict();
