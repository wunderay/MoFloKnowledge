import { z } from "zod";
import { UUIDSchema, TextSchema, collection } from "./primitives";
import {
  EntryKindSchema,
  BusinessEntrySchema,
  businessEntrySchemas,
  entryBusiness,
} from "./business";
import {
  EntryProvenanceSchema,
  CandidateConflictSchema,
  JSONValueSchema,
  StablePointerSchema,
} from "./provenance";
import { fieldForTarget } from "./field-registry";
import { resolveStablePointer } from "./stable-pointer";
export const ProposalChangeSchema = z
  .object({ id: UUIDSchema, target: StablePointerSchema })
  .strict();
export const ProposalChangesSchema = z
  .array(ProposalChangeSchema)
  .max(41)
  .superRefine((changes, ctx) => {
    const ids = new Set<string>(),
      targets = new Set<string>();
    changes.forEach((change, index) => {
      if (ids.has(change.id) || targets.has(change.target))
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "Proposal change IDs and targets must be unique",
        });
      ids.add(change.id);
      targets.add(change.target);
    });
  });
export const ProposalSchema = z
  .object({
    id: UUIDSchema,
    kind: EntryKindSchema,
    target_entry_id: UUIDSchema.nullable(),
    base_revision: z.number().int().positive().nullable(),
    schema_version: z.literal("1.0.0"),
    content: BusinessEntrySchema,
    provenance: EntryProvenanceSchema,
    conflicts: collection(CandidateConflictSchema),
    changes: ProposalChangesSchema.optional().default([]),
    model: TextSchema.optional(),
    prompt_version: TextSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const result = businessEntrySchemas[v.kind].safeParse(v.content);
    if (!result.success) {
      for (const issue of result.error.issues)
        ctx.addIssue({ ...issue, path: ["content", ...issue.path] });
      return;
    }
    const candidateIds = new Set(
      v.conflicts.flatMap((conflict) =>
        conflict.candidates.map((candidate) => candidate.id),
      ),
    );
    v.changes.forEach((change, index) => {
      const field = fieldForTarget(change.target);
      const itemId = "id" in v.content ? v.content.id : null;
      if (
        !field ||
        field.kind !== v.kind ||
        field.path.replace("@id", `@${itemId}`) !== change.target
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["changes", index, "target"],
          message:
            "Change must target an exact top-level field of this entry kind",
        });
        return;
      }
      if (candidateIds.has(change.id))
        ctx.addIssue({
          code: "custom",
          path: ["changes", index, "id"],
          message: "Change ID conflicts with a candidate ID",
        });
      if (
        [...v.conflicts, ...v.provenance.conflicts].some(
          (conflict) =>
            conflict.target === change.target ||
            conflict.target.startsWith(change.target + "/") ||
            change.target.startsWith(conflict.target + "/"),
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["changes", index, "target"],
          message: "Conflicting fields must use their candidate selections",
        });
      try {
        const value = resolveStablePointer(
          entryBusiness(v.kind, v.content),
          change.target,
        );
        if (value === null || (Array.isArray(value) && value.length === 0))
          ctx.addIssue({
            code: "custom",
            path: ["changes", index, "target"],
            message: "Ordinary changes must contain a populated proposed value",
          });
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["changes", index, "target"],
          message: "Change target does not resolve in proposed content",
        });
      }
    });
  });
/** Extraction candidates carry captured observations; trusted code assigns UUIDs and metadata. */
export const ExtractionCandidateSchema = z
  .object({
    target: StablePointerSchema,
    value: JSONValueSchema,
    origin: z.literal("source_backed"),
    segment_ids: z.array(z.string().min(1).max(200)).max(100),
    observation_ids: z.array(z.string().min(1).max(200)).max(100),
    note: TextSchema.nullable(),
  })
  .strict();
export const ExtractionOutputSchema = z
  .object({
    candidates: z.array(ExtractionCandidateSchema).max(500),
    limitations: z.array(TextSchema).max(100),
  })
  .strict();
export type ProposalChange = z.infer<typeof ProposalChangeSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;
