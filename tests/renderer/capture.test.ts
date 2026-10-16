import { it, expect } from 'vitest';
import { chromium } from 'playwright-core';
import { captureRenderedPage } from '../../src/renderer/capture';
it('captures actual JS-visible content and separate style/font/logo observations in fresh contexts', async () => {
    // Controlled network-free fixture only. This explicitly does not prove production sandbox/egress.
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false });
    try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        await context.addCookies([{ name: 'session', value: 'fixture', url: 'https://example.com' }]);
        await context.route('**/*', route => route.abort());
        const page = await context.newPage();
        await page.setContent('<style>body { font-family: Arial; color: rgb(10,20,30) } button { background: #ffee00 }</style><header><img alt="Acme logo" src="https://example.com/logo.svg"></header><main><h1>Start</h1><button>Try it</button></main><script>document.querySelector("h1").textContent="JS company";localStorage.setItem("secret","value")</script>');
        const capture = await captureRenderedPage(page);
        expect(capture.text).toContain('JS company');
        expect(capture.styles.find(style => style.selector.startsWith('h1'))?.color).toBe('rgb(10, 20, 30)');
        expect(capture.stylesheets[0]?.declarations).toContain('font-family');
        expect(capture.logos[0]?.url).toBe('https://example.com/logo.svg');
        await context.close();
        const fresh = await browser.newContext();
        const next = await fresh.newPage();
        await next.setContent('<main>Fresh</main>');
        expect(await fresh.cookies()).toEqual([]);
        await fresh.close();
    }
    finally {
        await browser.close();
    }
}, 15000);
