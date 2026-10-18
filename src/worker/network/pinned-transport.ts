import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { crawlLimits } from '../../lib/config/crawl-limits';
import { approveDestination, type Address } from './destination-policy';
import { assertDocumentScope, normalizeUrl, NetworkPolicyError } from './url-scope';
const BOT_USER_AGENT = 'MoFloKnowledgeBot/1.0';
export interface FetchResult {
    requestedUrl: string;
    finalUrl: string;
    status: number;
    headers: Record<string, string>;
    body: Buffer;
    redirects: string[];
}
export interface FetchOptions {
    scope?: readonly string[];
    pathPrefix?: string;
    signal?: AbortSignal;
    maxBytes?: number;
    timeoutMs?: number;
    method?: 'GET' | 'HEAD';
    redirect?: 'manual';
    onRequest?: (url: string) => Promise<void>;
}
export type DestinationApprover = (url: string) => Promise<{
    url: URL;
    addresses: Address[];
}>;
// Dependency injection is module-local construction, never environment-controlled private-IP allowances.
export function createPinnedFetcher(approve: DestinationApprover) {
    return async function fetchPinned(input: string, options: FetchOptions = {}): Promise<FetchResult> {
        const requestedUrl = normalizeUrl(input);
        let current = requestedUrl;
        const redirects: string[] = [];
        const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(options.timeoutMs ?? crawlLimits().fetchMs)]);
        const maxBytes = Math.min(options.maxBytes ?? crawlLimits().maxHtmlBytes, Math.max(crawlLimits().maxHtmlBytes, crawlLimits().maxDesignBytes));
        for (;;) {
            if (options.scope) {
              assertDocumentScope(current, options.scope, options.pathPrefix);
            }
            signal.throwIfAborted();
            await options.onRequest?.(current);
            signal.throwIfAborted();
            const { url, addresses } = await new Promise<Awaited<ReturnType<DestinationApprover>>>((resolve, reject) => { const abort = () => { reject(signal.reason); }; signal.addEventListener('abort', abort, { once: true }); approve(current).then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort); }); if (signal.aborted) {
              abort();
            } });
            signal.throwIfAborted();
            const selected = addresses[0];
            const result = await new Promise<FetchResult>((resolve, reject) => {
                const request = (url.protocol === 'https:' ? https : http).request({
                    protocol: url.protocol, hostname: selected.address, family: selected.family, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search,
                    method: options.method ?? 'GET', agent: false, signal,
                    headers: { host: url.host, 'user-agent': BOT_USER_AGENT, 'accept-encoding': 'gzip, deflate, br', accept: 'text/html, text/plain;q=0.9, */*;q=0.1' },
                    ...(url.protocol === 'https:' ? { servername: url.hostname, rejectUnauthorized: true, checkServerIdentity: (_host: string, cert: tls.PeerCertificate) => tls.checkServerIdentity(url.hostname, cert) } : {}),
                }, response => {
                    const headers: Record<string, string> = {};
                    for (const [key, value] of Object.entries(response.headers)) {
                      if (value !== undefined) {
                        headers[key] = Array.isArray(value) ? value.join(', ') : value;
                      }
                    }
                    const status = response.statusCode ?? 0;
                    if ([301, 302, 303, 307, 308].includes(status)) {
                        response.destroy();
                        resolve({ requestedUrl, finalUrl: current, status, headers, body: Buffer.alloc(0), redirects: [...redirects] });
                        return;
                    }
                    let decoded: Readable = response;
                    const encoding = response.headers['content-encoding'];
                    if (encoding && encoding !== 'identity') {
                        const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
                        if (!decoder) {
                            response.destroy();
                            reject(new NetworkPolicyError('Unsupported response encoding'));
                            return;
                        }
                        response.on('error', error => decoder.destroy(error));
                        decoded = response.pipe(decoder);
                    }
                    const chunks: Buffer[] = [];
                    let bytes = 0;
                    decoded.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) {
                        const error = new NetworkPolicyError('Decoded response byte budget exceeded');
                        decoded.destroy(error);
                        request.destroy(error);
                    }
                    else {
                      chunks.push(chunk);
                    } });
                    decoded.on('error', reject);
                    decoded.on('end', () => { resolve({ requestedUrl, finalUrl: current, status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks), redirects: [...redirects] }); });
                });
                request.on('error', reject);
                request.end();
            });
            if (![301, 302, 303, 307, 308].includes(result.status) || options.redirect === 'manual') {
              return result;
            }
            if (!result.headers.location || redirects.length >= 5) {
              throw new NetworkPolicyError('Missing redirect target or redirect limit exceeded');
            }
            const next = normalizeUrl(result.headers.location, current);
            if (options.scope) {
              assertDocumentScope(next, options.scope, options.pathPrefix);
            }
            redirects.push(next);
            current = next;
        }
    };
}
export const fetchDocument = createPinnedFetcher(approveDestination);
