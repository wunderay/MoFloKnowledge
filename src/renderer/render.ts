import { chromium, type Browser } from 'playwright-core';
import { RenderTaskSchema, RenderResultSchema, type RenderTask, type RenderResult } from '../contracts/render-task';
import { captureRenderedPage } from './capture';
import { installResourcePolicy } from './resource-policy';
import { requireQualifiedBoundary } from './boundary';
export interface RendererConfig {
    executablePath: string;
    proxyUrl: string;
    proxyToken: string;
    boundaryReportPath: string;
}
export class Renderer {
    private browser?: Browser;
    private busy = false;
    constructor(private readonly config: RendererConfig) { }
    async render(input: RenderTask, signal?: AbortSignal): Promise<RenderResult> {
        const task = RenderTaskSchema.parse(input);
        await requireQualifiedBoundary(this.config.boundaryReportPath);
        if (this.busy) {
          throw new Error('Renderer is busy');
        }
        this.busy = true;
        let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
        const combined = AbortSignal.any([AbortSignal.timeout(task.timeoutMs), ...(signal ? [signal] : [])]);
        const abort = () => { void context?.close(); };
        combined.addEventListener('abort', abort, { once: true });
        try {
            combined.throwIfAborted();
            this.browser ??= await chromium.launch({ executablePath: this.config.executablePath, chromiumSandbox: true, headless: true, timeout: task.timeoutMs, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8' }, proxy: { server: this.config.proxyUrl, username: 'moflo', password: this.config.proxyToken, bypass: '<-loopback>' }, args: ['--disable-quic', '--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ' + new URL(this.config.proxyUrl).hostname] });
            context = await this.browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, javaScriptEnabled: true, ignoreHTTPSErrors: false, userAgent: 'MoFloKnowledgeBot/1.0', permissions: [], viewport: { width: 1280, height: 900 } });
            combined.throwIfAborted();
            const policy = await installResourcePolicy(context, task, combined, this.config);
            const page = await context.newPage();
            await page.goto(task.url, { waitUntil: 'networkidle', timeout: task.timeoutMs });
            combined.throwIfAborted();
            const result = await captureRenderedPage(page);
            result.stylesheets = result.stylesheets.map(sheet => sheet.status === 'unavailable' ? (policy.stylesheets.find(captured => captured.url === sheet.url) ?? sheet) : sheet);
            return RenderResultSchema.parse({ ...result, resourceBytes: policy.resourceBytes, limitations: [...result.limitations, ...policy.limitations].slice(0, 100) });
        }
        finally {
            combined.removeEventListener('abort', abort);
            await context?.close().catch(() => { });
            this.busy = false;
        }
    }
    async close() { await this.browser?.close(); this.browser = undefined; }
}
