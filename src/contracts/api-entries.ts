import { z } from "zod";
import { IdSchema } from "./api-common";
import {
  EntryKindSchema,
  EntryProvenanceSchema,
  BusinessEntrySchema,
} from "./index";
export const CreateEntrySchema = z
  .object({
    kind: EntryKindSchema,
    content: BusinessEntrySchema,
    provenance: EntryProvenanceSchema,
    genderAttestation: z.string().trim().min(10).max(2000).optional(),
    requestId: IdSchema,
  })
  .strict();
export const SaveEntrySchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    content: BusinessEntrySchema,
    provenance: EntryProvenanceSchema,
    reviewStatus: z.enum(["unreviewed", "approved", "rejected"]),
    reason: z.string().max(2000).optional(),
    genderAttestation: z.string().trim().min(10).max(2000).optional(),
    requestId: IdSchema,
  })
  .strict();
export const RevertEntrySchema = z
  .object({
    fromRevision: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    requestId: IdSchema,
  })
  .strict();
/** Deleting a repeatable entry (a key person or an offering): the revision the caller saw, and one id per attempt so a retry is answered once. */
export const DeleteEntrySchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    requestId: IdSchema,
  })
  .strict();
