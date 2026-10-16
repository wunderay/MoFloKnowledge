import {z} from 'zod';
import {UUIDSchema,TextSchema,collection} from './primitives';
import {EntryKindSchema,BusinessEntrySchema,businessEntrySchemas} from './business';
import {EntryProvenanceSchema,CandidateConflictSchema,OriginSchema,JSONValueSchema,StablePointerSchema} from './provenance';
export const ProposalSchema=z.object({id:UUIDSchema,kind:EntryKindSchema,target_entry_id:UUIDSchema.nullable(),base_revision:z.number().int().positive().nullable(),schema_version:z.literal('1.0.0'),content:BusinessEntrySchema,provenance:EntryProvenanceSchema,conflicts:collection(CandidateConflictSchema),model:TextSchema.optional(),prompt_version:TextSchema.optional()}).strict().superRefine((v,ctx)=>{const result=businessEntrySchemas[v.kind].safeParse(v.content);if(!result.success)for(const issue of result.error.issues)ctx.addIssue({...issue,path:['content',...issue.path]});});
/** Model candidates carry only untrusted observations; trusted code assigns UUIDs and metadata. */
export const ModelCandidateSchema=z.object({target:StablePointerSchema,value:JSONValueSchema,origin:OriginSchema.exclude(['user_provided']),segment_ids:z.array(z.string().min(1).max(200)).max(100),observation_ids:z.array(z.string().min(1).max(200)).max(100),note:TextSchema.nullable()}).strict();
export const ModelOutputSchema=z.object({candidates:z.array(ModelCandidateSchema).max(500),limitations:z.array(TextSchema).max(100)}).strict();
export type Proposal=z.infer<typeof ProposalSchema>;
export type ModelCandidate=z.infer<typeof ModelCandidateSchema>;
