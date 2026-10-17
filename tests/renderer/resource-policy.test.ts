import { it, expect } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { installResourcePolicy } from '../../src/renderer/resource-policy';
it('uses bounded proxy resource channel and denies unrequested frames and writes', async () => {
    const requests: {
        url: string;
        method: string;
        maxBytes: number;
    }[] = [];
    // Controlled private service fixture; never resolves or connects submitted URLs.
    const fixture = http.createServer(async (req, res) => { const chunks: Buffer[] = []; for await (const raw of req)
        chunks.push(Buffer.from(raw)); const task = JSON.parse(Buffer.concat(chunks).toString()); requests.push(task); const body = task.url.endsWith('/style.css') ? 'h1 {color: rgb(1,2,3)}' : '<link rel="stylesheet" href="/style.css"><main><h1>Bounded</h1></main><iframe src="https://example.com/private"></iframe><script>fetch("/write",{method:"POST",body:"unsafe"}).catch(()=>{})</script>'; res.writeHead(200, { 'content-type': task.url.endsWith('.css') ? 'text/css' : 'text/html', 'x-moflo-status': '200' }).end(body); });
    fixture.listen(0, '127.0.0.1');
    await once(fixture, 'listening');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, chromiumSandbox: false });
    try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const policy = await installResourcePolicy(context, { url: 'https://example.com/', scope: ['example.com'], timeoutMs: 25000, maxDesignBytes: 1024 }, AbortSignal.timeout(10000), { proxyUrl: `http://127.0.0.1:${(fixture.address() as {
                port: number;
            }).port}`, proxyToken: 'f'.repeat(32) });
        const page = await context.newPage();
        await page.goto('https://example.com/', { waitUntil: 'networkidle' });
        expect(await page.locator('h1').evaluate(element => getComputedStyle(element).color)).toBe('rgb(1, 2, 3)');
        expect(requests.map(item => item.url)).toEqual(['https://example.com/', 'https://example.com/style.css']);
        expect(requests[1]?.maxBytes).toBe(1024);
        expect(policy.resourceBytes).toBeGreaterThan(0);
        expect(policy.limitations.some(message => /navigation|Frames/.test(message))).toBe(true);
        await context.close();
    }
    finally {
        await browser.close();
        await new Promise<void>(resolve => fixture.close(() => resolve()));
    }
}, 15000);
