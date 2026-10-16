import http from 'node:http';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { approveDestination } from '../worker/network/destination-policy';
import { fetchDocument } from '../worker/network/pinned-transport';
import { normalizeUrl } from '../worker/network/url-scope';
export function authenticate(actual: string | undefined, expected: string): boolean { const a = Buffer.from(actual ?? ''), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
export type ProxyOptions = {
    token: string;
    maxConnections?: number;
    maxBytes?: number;
    timeoutMs?: number;
    deniedHosts?: string[];
};
export function createEgressProxy(options: ProxyOptions) {
    if (options.token.length < 32)
        throw new Error('Proxy token must contain at least 32 characters');
    const expected = 'Basic ' + Buffer.from('moflo:' + options.token).toString('base64');
    const maxBytes = Math.min(options.maxBytes ?? 15 * 1024 * 1024, 15 * 1024 * 1024);
    let active = 0;
    const permitted = (url: string) => { const parsed = new URL(normalizeUrl(url)); if (options.deniedHosts?.includes(parsed.hostname))
        throw new Error('Proxy recursion denied'); return parsed; };
    const server = http.createServer({ maxHeaderSize: 16 * 1024 }, async (req, res) => {
        if (!authenticate(req.headers['proxy-authorization'], expected)) {
            res.writeHead(407, { 'proxy-authenticate': 'Basic realm="moflo"' }).end();
            return;
        }
        if (!['GET', 'HEAD'].includes(req.method ?? '') || active >= (options.maxConnections ?? 8)) {
            res.writeHead(405).end();
            return;
        }
        active++;
        const abort = new AbortController();
        res.on('close', () => abort.abort());
        try {
            const url = permitted(req.url ?? '');
            if (url.protocol !== 'http:')
                throw new Error('HTTPS requires CONNECT');
            const result = await fetchDocument(url.href, { method: req.method as 'GET' | 'HEAD', signal: abort.signal, maxBytes, timeoutMs: options.timeoutMs ?? 25000, redirect: 'manual' });
            // Never relay remote cookies, authentication, redirects or hop-by-hop headers to the renderer.
            const headers: Record<string, string> = { 'content-length': String(result.body.length), 'cache-control': 'no-store' };
            for (const name of ['content-type', 'last-modified', 'etag', 'location'])
                if (result.headers[name])
                    headers[name] = result.headers[name];
            res.writeHead(result.status, headers).end(result.body);
        }
        catch {
            if (!res.headersSent)
                res.writeHead(502);
            res.end();
        }
        finally {
            active--;
        }
    });
    server.on('connect', async (req, client, head) => {
        if (!authenticate(req.headers['proxy-authorization'], expected)) {
            client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            return;
        }
        if (active >= (options.maxConnections ?? 8)) {
            client.destroy();
            return;
        }
        active++;
        let upstream: net.Socket | undefined;
        let finished = false;
        const cleanup = () => { if (finished)
            return; finished = true; active--; upstream?.destroy(); client.destroy(); };
        client.once('close', cleanup);
        client.once('error', cleanup);
        const timer = setTimeout(cleanup, Math.min(options.timeoutMs ?? 25000, 25000));
        timer.unref();
        try {
            if (!/^[a-zA-Z0-9.-]+:443$/.test(req.url ?? ''))
                throw new Error('Only hostname:443 CONNECT is allowed');
            const url = permitted('https://' + req.url + '/');
            const approved = await approveDestination(url.href);
            if (finished)
                return;
            const address = approved.addresses[0]!;
            upstream = net.connect({ host: address.address, port: 443, family: address.family });
            upstream.once('error', cleanup);
            upstream.once('close', cleanup);
            let bytes = head.length;
            const count = (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes)
                cleanup(); };
            client.on('data', count);
            upstream.on('data', count);
            upstream.once('connect', () => { if (finished)
                return; client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length)
                upstream!.write(head); client.pipe(upstream!); upstream!.pipe(client); });
        }
        catch {
            cleanup();
        }
        finally {
            client.once('close', () => clearTimeout(timer));
        }
    });
    server.on('clientError', (_error, socket) => socket.destroy());
    server.requestTimeout = 25000;
    server.headersTimeout = 10000;
    server.maxRequestsPerSocket = 20;
    return server;
}
