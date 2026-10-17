import { z } from "zod";
import {
  UUIDSchema as uuid,
  URLSchema as url,
  DateOnlySchema as date,
  InstantSchema as instant,
  TextSchema as text,
  NullableTextSchema as nullable,
  collection,
} from "./primitives";
import { EntryKindSchema } from "./business";
export const OriginSchema = z.enum([
  "source_backed",
  "inferred",
  "generated",
  "user_provided",
]);
export const AssessmentSchema = z.enum([
  "found",
  "not_found",
  "not_checked",
  "partial",
  "conflict",
]);
export const ReviewStatusSchema = z.enum([
  "unreviewed",
  "approved",
  "rejected",
]);
export const StablePointerSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^(?:\/(?:[^~]|~[01])*)+$/);
export const SourceSchema = z
  .object({
    id: uuid,
    url,
    title: nullable,
    author: nullable,
    site_name: nullable,
    published_on: date.nullable(),
    retrieved_at: instant,
  })
  .strict();
export const TechnicalEvidenceSchema = z
  .object({
    selector: nullable,
    property: nullable,
    value: nullable,
    asset_url: url.nullable(),
  })
  .strict();
export const EvidenceSchema = z
  .object({
    id: uuid,
    source_page_id: uuid,
    kind: z.enum(["text", "technical"]),
    excerpt: nullable,
    technical: TechnicalEvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === "text" && (!v.excerpt || v.technical !== null))
      ctx.addIssue({
        code: "custom",
        message:
          "Text evidence requires exact excerpt and no technical metadata",
      });
    if (
      v.kind === "technical" &&
      (!v.technical || !Object.values(v.technical).some((x) => x !== null))
    )
      ctx.addIssue({
        code: "custom",
        message: "Technical evidence requires a labeled captured observation",
      });
  });
export const ClaimSchema = z
  .object({
    id: uuid,
    entry_id: uuid,
    targets: z.array(StablePointerSchema).min(1).max(1000),
    origin: OriginSchema,
    evidence_ids: z.array(uuid).max(500),
    based_on_claim_ids: z.array(uuid).max(500),
    actor_id: uuid.nullable(),
    authored_at: instant.nullable(),
    note: nullable,
  })
  .strict();
export const CoverageAssessmentSchema = z
  .object({
    targets: z.array(StablePointerSchema).min(1).max(1000),
    status: AssessmentSchema,
    job_id: uuid.nullable(),
    reason: nullable,
  })
  .strict();
export const OperationSchema = z
  .object({
    request_id: uuid,
    entry_id: uuid.nullable(),
    kind: z.string().min(1).max(100),
    supersedes_claim_id: uuid.nullable(),
    note: nullable,
  })
  .strict();
type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONValue[]
  | { [key: string]: JSONValue };
export const JSONValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string().max(20000),
    z.number().finite(),
    z.boolean(),
    z.array(JSONValueSchema).max(500),
    z.record(JSONValueSchema),
  ]),
);
export const FieldCandidateSchema = z
  .object({
    id: uuid,
    value: JSONValueSchema,
    origin: OriginSchema,
    evidence_ids: z.array(uuid).max(500),
    based_on_claim_ids: z.array(uuid).max(500),
  })
  .strict();
export const CandidateConflictSchema = z
  .object({
    id: uuid,
    target: StablePointerSchema,
    candidates: collection(FieldCandidateSchema).refine(
      (v) => v.length >= 2,
      "Conflict needs at least two candidates",
    ),
    material: z.boolean(),
  })
  .strict();
export const ConflictDecisionSchema = z
  .object({
    id: uuid,
    conflict_id: uuid,
    target: StablePointerSchema,
    action: z.enum(["select", "correct", "clear"]),
    candidate_id: uuid.nullable(),
    actor_id: uuid,
    decided_at: instant,
    note: text.max(2000),
  })
  .strict()
  .refine(
    (v) =>
      v.action === "select" ? v.candidate_id !== null : v.candidate_id === null,
    "Candidate ID required only for selection",
  );
export const EntryProvenanceSchema = z
  .object({
    sources: collection(SourceSchema),
    evidence: collection(EvidenceSchema),
    claims: collection(ClaimSchema),
    coverage: z.array(CoverageAssessmentSchema).max(500),
    operations: z.array(OperationSchema).max(1000),
    conflicts: collection(CandidateConflictSchema).optional().default([]),
    decisions: collection(ConflictDecisionSchema).optional().default([]),
  })
  .strict();
export const EntryStateSchema = z
  .object({
    entry_id: uuid,
    kind: EntryKindSchema,
    revision: z.number().int().positive(),
    review_status: z.enum(["approved", "rejected"]),
    author_id: uuid,
    saved_at: instant,
  })
  .strict();
export const ExportProvenanceSchema = z
  .object({
    company: z
      .object({ name: text, website: url, snapshot_author_id: uuid })
      .strict(),
    entries: z.array(EntryStateSchema).max(1000),
    sources: collection(SourceSchema),
    evidence: collection(EvidenceSchema),
    claims: collection(ClaimSchema),
    // 1,000 rows before site_links; the registry's 30th singleton field adds one row to every snapshot.
    coverage: z.array(CoverageAssessmentSchema).max(1001),
    operations: z.array(OperationSchema).max(1000),
  })
  .strict();
export type Origin = z.infer<typeof OriginSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type CoverageAssessment = z.infer<typeof CoverageAssessmentSchema>;
export type Operation = z.infer<typeof OperationSchema>;
export type FieldCandidate = z.infer<typeof FieldCandidateSchema>;
export type CandidateConflict = z.infer<typeof CandidateConflictSchema>;
export type ConflictDecision = z.infer<typeof ConflictDecisionSchema>;
export type EntryProvenance = z.infer<typeof EntryProvenanceSchema>;
export type EntryState = z.infer<typeof EntryStateSchema>;
export type ExportProvenance = z.infer<typeof ExportProvenanceSchema>;
