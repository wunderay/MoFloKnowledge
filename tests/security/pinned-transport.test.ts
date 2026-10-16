import { it, expect } from 'vitest';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { createPinnedFetcher } from '../../src/worker/network/pinned-transport';
import { approveDestination } from '../../src/worker/network/destination-policy';
it('pins actual fixture socket, preserves Host, gates each redirect and bounds decoded bytes', async () => {
    let host = '';
    let hits = 0;
    const server = http.createServer((req, res) => { hits++; host = req.headers.host ?? ''; if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://private.example.com/' }).end();
        return;
    } if (req.url === '/loop') {
        res.writeHead(302, { location: '/loop' }).end();
        return;
    } res.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync(Buffer.alloc(1024, 'x'))); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as {
        port: number;
    }).port;
    let approvals = 0;
    // Explicit controlled fixture-only injection, absent from all production entry points.
    const fixture = createPinnedFetcher(async (input) => { approvals++; if (new URL(input).hostname === 'private.example.com')
        return approveDestination(input, async () => [{ address: '127.0.0.1', family: 4 }]); const url = new URL(input); url.port = String(port); return { url, addresses: [{ address: '127.0.0.1', family: 4 }] }; });
    try {
        const response = await fixture('http://example.com/', { scope: ['example.com'] });
        expect(response.body.length).toBe(1024);
        expect(host).toBe(`example.com:${port}`);
        expect(approvals).toBe(1);
        await expect(fixture('http://example.com/', { maxBytes: 100 })).rejects.toThrow('budget');
        const before = hits;
        await expect(fixture('http://example.com/redirect')).rejects.toThrow('exclusively global');
        expect(hits - before).toBe(1);
        await expect(fixture('http://example.com/loop')).rejects.toThrow('redirect limit');
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
