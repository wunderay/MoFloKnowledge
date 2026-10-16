import { it, expect } from 'vitest';
import { once } from 'node:events';
import { createTaskServer } from '../../src/renderer/task-server';
import { RenderTaskSchema } from '../../src/contracts/render-task';
import { Renderer } from '../../src/renderer/render';
it('rejects unauthenticated, oversized and out-of-scope tasks without browser work', async () => {
    let called = 0;
    const token = 'r'.repeat(32);
    const server = createTaskServer(token, async () => { called++; throw new Error('not expected'); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as {
        port: number;
    }).port}/render`;
    try {
        expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401);
        expect((await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: 'x'.repeat(20000) })).status).toBe(422);
        expect(RenderTaskSchema.safeParse({ url: 'https://other.com', scope: ['example.com'] }).success).toBe(false);
        expect(called).toBe(0);
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
it('fails closed before browser launch when host confinement is unqualified', async () => {
    const renderer = new Renderer({ executablePath: '/must/not/launch', proxyUrl: 'http://127.0.0.1:3128', proxyToken: 'x'.repeat(32), boundaryReportPath: '' });
    await expect(renderer.render({ url: 'https://example.com', scope: ['example.com'], timeoutMs: 25000, maxDesignBytes: 1024 })).rejects.toThrow('NOT_QUALIFIED');
});
