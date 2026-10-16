import { z } from 'zod';
import { assertDocumentScope, documentScope, normalizeUrl } from '../worker/network/url-scope';
export const RenderTaskSchema = z.object({ url: z.string().max(8192), scope: z.array(z.string().min(1).max(253)).min(1).max(2), timeoutMs: z.number().int().min(1).max(25000).default(25000), maxDesignBytes: z.number().int().min(0).max(15 * 1024 * 1024).default(15 * 1024 * 1024) }).strict().superRefine((task, ctx) => { try {
    assertDocumentScope(normalizeUrl(task.url), task.scope);
    if (task.scope.some(host => !documentScope(task.url).includes(host)))
        throw new Error('Unrelated scope');
}
catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid render URL/scope' });
} });
export type RenderTask = z.infer<typeof RenderTaskSchema>;
export const RenderResultSchema = z.object({ finalUrl: z.string().max(8192), text: z.string().max(100000), styles: z.array(z.object({ selector: z.string(), evidenceId: z.string(), fontFamily: z.string(), fontSize: z.string(), fontWeight: z.string(), color: z.string(), backgroundColor: z.string() })).max(100), stylesheets: z.array(z.object({ url: z.string().nullable(), declarations: z.string().max(100000), status: z.enum(['available', 'unavailable']) })).max(50), fonts: z.array(z.object({ url: z.string(), loaded: z.boolean() })).max(100), logos: z.array(z.object({ url: z.string(), alt: z.string(), context: z.string() })).max(40), limitations: z.array(z.string().max(500)).max(100), resourceBytes: z.number().int().nonnegative().max(15 * 1024 * 1024) }).strict();
export type RenderResult = z.infer<typeof RenderResultSchema>;
