import { setTimeout as delay } from 'node:timers/promises';
import { createProxyFetcher } from './proxy-fetch';
import type { BrowserContext } from 'playwright-core';
import type { RenderTask } from '../contracts/render-task';
import { assertDocumentScope, normalizeUrl } from '../worker/network/url-scope';
export async function installResourcePolicy(context: BrowserContext, task: RenderTask, signal: AbortSignal, config: {
    proxyUrl: string;
    proxyToken: string;
}) {
    const fetchResource = createProxyFetcher(config);
    const allowedNavigations = new Set([normalizeUrl(task.url)]);
    const starts = new Map<string, number>();
    let resourceBytes = 0, documentCount = 0;
    const limitations: string[] = [];
    const stylesheets: {
        url: string;
        declarations: string;
        status: 'available';
    }[] = [];
    let queue = Promise.resolve();
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async (route) => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
            signal.throwIfAborted();
            const request = route.request();
            const url = normalizeUrl(request.url());
            const type = request.resourceType();
            if (!['GET', 'HEAD'].includes(request.method()) || ['websocket', 'media', 'eventsource', 'manifest'].includes(type))
                throw new Error('Resource method/type blocked');
            if (request.isNavigationRequest()) {
                assertDocumentScope(url, task.scope);
                if (!allowedNavigations.has(url))
                    throw new Error('Unrequested document navigation blocked');
                if (request.frame().parentFrame())
                    throw new Error('Frames disabled');
                if (++documentCount > 6)
                    throw new Error('Navigation limit exceeded');
            }
            if (type === 'document' && request.frame().parentFrame())
                throw new Error('Frames disabled');
            const host = new URL(url).hostname;
            const wait = (starts.get(host) ?? 0) + 500 - Date.now();
            if (wait > 0)
                await delay(wait, undefined, { signal });
            starts.set(host, Date.now());
            const max = request.isNavigationRequest() ? 2 * 1024 * 1024 : Math.max(0, task.maxDesignBytes - resourceBytes);
            const response = await fetchResource(url, request.method() as 'GET' | 'HEAD', max, signal);
            const body = response.body;
            signal.throwIfAborted();
            if (body.length > max)
                throw new Error('Resource byte budget exceeded');
            if (!request.isNavigationRequest())
                resourceBytes += body.length;
            if (type === 'stylesheet' && stylesheets.length < 50)
                stylesheets.push({ url, declarations: body.toString('utf8').slice(0, 100000), status: 'available' });
            if (request.isNavigationRequest() && [301, 302, 303, 307, 308].includes(response.status)) {
                const target = normalizeUrl(response.headers.location ?? '', url);
                assertDocumentScope(target, task.scope);
                allowedNavigations.add(target);
            }
            await route.fulfill({ status: response.status, body, headers: response.headers });
        }
        catch (error) {
            limitations.push(error instanceof Error ? error.message : 'Resource blocked');
            await route.abort('blockedbyclient').catch(() => { });
        }
        finally {
            release();
        }
    });
    await context.addInitScript(() => {
        Object.defineProperty(window, 'WebSocket', { value: class {
                constructor() { throw new Error('WebSocket disabled'); }
            } });
        Object.defineProperty(window, 'RTCPeerConnection', { value: undefined });
        Object.defineProperty(window, 'webkitRTCPeerConnection', { value: undefined });
    });
    context.on('page', page => { page.on('download', download => void download.cancel()); page.on('popup', popup => void popup.close()); });
    return { get resourceBytes() { return resourceBytes; }, limitations, stylesheets };
}
