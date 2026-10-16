import { RenderTaskSchema, RenderResultSchema, type RenderTask } from '../contracts/render-task';
export function createRendererClient(config: {
    url: string;
    token: string;
}) {
    const endpoint = new URL('/render', config.url);
    if (!['http:', 'https:'].includes(endpoint.protocol))
        throw new Error('Invalid renderer endpoint');
    return async (task: RenderTask, signal?: AbortSignal) => { const response = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer ' + config.token, 'content-type': 'application/json' }, body: JSON.stringify(RenderTaskSchema.parse(task)), signal: AbortSignal.any([AbortSignal.timeout(25000), ...(signal ? [signal] : [])]), redirect: 'error' }); if (!response.ok)
        throw new Error('Renderer unavailable'); const text = await response.text(); if (text.length > 8 * 1024 * 1024)
        throw new Error('Renderer response too large'); return RenderResultSchema.parse(JSON.parse(text)); };
}
