import http from 'node:http';
import { RenderTaskSchema, RenderResultSchema, type RenderTask, type RenderResult } from '../contracts/render-task';
import { authenticate } from '../egress/proxy';
export function createTaskServer(token: string, render: (task: RenderTask, signal: AbortSignal) => Promise<RenderResult>) {
    if (token.length < 32)
        throw new Error('Renderer token must contain at least 32 characters');
    let active = false;
    return http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
        res.setHeader('cache-control', 'no-store');
        res.setHeader('content-type', 'application/json');
        if (!authenticate(req.headers.authorization, 'Bearer ' + token)) {
            res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        if (req.method !== 'POST' || req.url !== '/render') {
            res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        if (active) {
            res.writeHead(429).end(JSON.stringify({ error: 'Renderer busy' }));
            return;
        }
        active = true;
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 25000);
        res.on('close', () => abort.abort());
        try {
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const raw of req) {
                const chunk = Buffer.from(raw);
                bytes += chunk.length;
                if (bytes > 16 * 1024)
                    throw new Error('Task too large');
                chunks.push(chunk);
            }
            const task = RenderTaskSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            const result = RenderResultSchema.parse(await render(task, abort.signal));
            res.writeHead(200).end(JSON.stringify(result));
        }
        catch {
            if (!res.headersSent)
                res.writeHead(abort.signal.aborted ? 504 : 422);
            res.end(JSON.stringify({ error: 'Render unavailable or invalid task' }));
        }
        finally {
            clearTimeout(timer);
            active = false;
        }
    });
}
