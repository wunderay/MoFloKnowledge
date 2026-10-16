import { z } from 'zod';
export const UUIDSchema = z.string().uuid();
export const TextSchema = z.string().min(1).max(20000);
export const NullableTextSchema = TextSchema.nullable();
export const URLSchema = z.string().max(4096).url().refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, 'Expected absolute HTTP(S) URL without credentials');
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value; }, 'Invalid calendar date');
export const InstantSchema = z.string().datetime({offset:true});
export const DecimalSchema = z.string().max(100).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const collection = <T extends z.ZodTypeAny>(schema:T) => z.array(schema).max(500).superRefine((items, ctx) => { const ids = new Set<string>(); items.forEach((item,index) => { if (item && typeof item === 'object' && 'id' in item) { if (ids.has(item.id)) ctx.addIssue({code:'custom',message:'Duplicate item UUID',path:[index,'id']}); ids.add(item.id); } }); });
export type UUID = z.infer<typeof UUIDSchema>;
export type DateOnly = z.infer<typeof DateOnlySchema>;
export type Instant = z.infer<typeof InstantSchema>;
export type HTTPURL = z.infer<typeof URLSchema>;
