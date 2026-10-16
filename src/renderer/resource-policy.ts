import type { BrowserContext } from 'playwright-core';
import type { RenderTask } from '../contracts/render-task';
import { assertDocumentScope, normalizeUrl } from '../worker/network/url-scope';
export async function installResourcePolicy(context: BrowserContext, task: RenderTask, signal: AbortSignal) {
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
                if (request.frame().parentFrame())
                    throw new Error('Frames disabled');
                if (++documentCount > 6)
                    throw new Error('Navigation limit exceeded');
            }
            if (type === 'document' && request.frame().parentFrame())
                throw new Error('Frames disabled');
            const response = await route.fetch({ headers: { ...request.headers(), cookie: '', authorization: '', 'user-agent': 'MoFloKnowledgeBot/1.0' }, maxRedirects: 0, timeout: task.timeoutMs });
            const max = request.isNavigationRequest() ? 2 * 1024 * 1024 : Math.max(0, task.maxDesignBytes - resourceBytes);
            const length = Number(response.headers()['content-length']);
            if (length > max)
                throw new Error('Resource byte budget exceeded');
            const body = await response.body();
            signal.throwIfAborted();
            if (body.length > max)
                throw new Error('Resource byte budget exceeded');
            if (!request.isNavigationRequest())
                resourceBytes += body.length;
            if (type === 'stylesheet' && stylesheets.length < 50)
                stylesheets.push({ url, declarations: body.toString('utf8').slice(0, 100000), status: 'available' });
            const headers = { ...response.headers() };
            delete headers['set-cookie'];
            delete headers['set-cookie2'];
            await route.fulfill({ response, body, headers });
        }
        catch (error) {
            limitations.push(error instanceof Error ? error.message : 'Resource blocked');
            await route.abort('blockedbyclient').catch(() => { });
        }
        finally {
            release();
        }
    });
    await context.addInitScript(() => { Object.defineProperty(window, 'WebSocket', { value: class {
            constructor() { throw new Error('WebSocket disabled'); }
        } }); Object.defineProperty(window, 'RTCPeerConnection', { value: undefined }); Object.defineProperty(window, 'webkitRTCPeerConnection', { value: undefined }); });
    context.on('page', page => { page.on('download', download => void download.cancel()); page.on('popup', popup => void popup.close()); });
    return { get resourceBytes() { return resourceBytes; }, limitations, stylesheets };
}
