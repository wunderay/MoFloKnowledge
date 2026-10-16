import { z } from "zod";
import { IdSchema, GenerationSchema } from "./api-common";
import {
  BusinessEntrySchema,
  EntryKindSchema,
  EntryProvenanceSchema,
  InstantSchema,
  URLSchema,
  JobStatusSchema,
  ProgressSchema,
  SafeJobErrorSchema,
  ProposalSchema,
  ReviewStatusSchema,
  CoverageAssessmentSchema,
} from "./index";
const role = z.enum(["owner", "editor", "viewer"]);
export const CompanyRowSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1).max(200),
    website_url: URLSchema,
    created_by: IdSchema,
    creation_request_id: IdSchema,
    created_at: InstantSchema,
    updated_at: InstantSchema,
    archived_at: InstantSchema.nullable(),
    draft_generation: GenerationSchema,
    next_snapshot_version: z.number().int().positive().safe(),
  })
  .strict();
export const CompanyReadSchema = CompanyRowSchema.extend({ role }).strict();
export const LatestJobSchema = z
  .object({
    id: IdSchema,
    status: JobStatusSchema,
    progress: z.record(z.unknown()),
    created_at: InstantSchema,
  })
  .strict();
export const LatestVersionSchema = z
  .object({
    id: IdSchema,
    version_number: z.number().int().positive().safe(),
    created_at: InstantSchema,
  })
  .strict();
export const CompanySummarySchema = CompanyReadSchema.extend({
  latestJob: LatestJobSchema.nullable(),
  latestVersion: LatestVersionSchema.nullable(),
}).strict();
export const CompanyListSchema = z
  .object({
    companies: z.array(CompanySummarySchema),
    nextCursor: IdSchema.nullable(),
  })
  .strict();
export const RevisionResponseSchema = z
  .object({
    id: IdSchema,
    company_id: IdSchema,
    entry_id: IdSchema,
    revision: z.number().int().positive(),
    schema_version: z.literal("1.0.0"),
    content: BusinessEntrySchema,
    provenance: EntryProvenanceSchema,
    review_status: ReviewStatusSchema,
    author_id: IdSchema,
    change_reason: z.string().max(2000).nullable(),
    created_at: InstantSchema,
  })
  .strict();
export const DraftEntryResponseSchema = RevisionResponseSchema.extend({
  kind: EntryKindSchema,
  current_revision: z.number().int().positive(),
  created_by: IdSchema,
  saved_at: InstantSchema,
}).strict();
export const SourceSummarySchema = z
  .object({
    id: IdSchema,
    company_id: IdSchema,
    scrape_job_id: IdSchema,
    normalized_url: URLSchema,
    final_url: URLSchema.nullable(),
    title: z.string().nullable(),
    author: z.string().nullable(),
    site_name: z.string().nullable(),
    published_on: z.string().nullable(),
    retrieved_at: InstantSchema.nullable(),
    capture_status: z.enum(["captured", "failed", "blocked", "unsupported"]),
  })
  .strict();
export const DraftResponseSchema = z
  .object({
    actorId: IdSchema,
    company: CompanyReadSchema,
    draftGeneration: GenerationSchema,
    entries: z.array(DraftEntryResponseSchema),
    sources: z.array(SourceSummarySchema),
  })
  .strict();
const proposalDecision = z
  .object({
    proposal_id: IdSchema,
    action: z.enum(["apply", "dismiss"]),
    actor_id: IdSchema,
    at: InstantSchema,
    reason: z.string().max(2000).nullable().optional(),
    revision_id: IdSchema.optional(),
  })
  .strict();
export const JobResponseSchema = z
  .object({
    id: IdSchema,
    company_id: IdSchema,
    status: JobStatusSchema,
    progress: ProgressSchema,
    errors: z.array(SafeJobErrorSchema),
    proposals: z
      .object({
        candidates: z.array(ProposalSchema),
        decisions: z.array(proposalDecision),
        coverage: z.array(CoverageAssessmentSchema),
        initialized_entry_ids: z.array(IdSchema),
      })
      .strict(),
    cancel_requested_at: InstantSchema.nullable(),
    created_at: InstantSchema,
    updated_at: InstantSchema,
  })
  .strict();
export const VersionSummarySchema = z
  .object({
    id: IdSchema,
    version_number: z.number().int().positive().safe(),
    schema_version: z.literal("1.0.0"),
    author_id: IdSchema,
    created_at: InstantSchema,
    payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
