export type ProxyResource = {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
};
/** Private control channel to the same egress proxy. It streams/decompresses at
 * the destination boundary before returning bytes, avoiding browser-driver
 * buffering of an unbounded compressed response. */
export function createProxyFetcher(config: {
    proxyUrl: string;
    proxyToken: string;
}) {
    return async (url: string, method: 'GET' | 'HEAD', maxBytes: number, signal: AbortSignal): Promise<ProxyResource> => {
        const response = await fetch(new URL('/fetch', config.proxyUrl), { method: 'POST', headers: { authorization: 'Bearer ' + config.proxyToken, 'content-type': 'application/json' }, body: JSON.stringify({ url, method, maxBytes }), signal, redirect: 'error' });
        if (!response.ok || !response.body)
            throw new Error('Bounded egress fetch unavailable');
        const chunks: Buffer[] = [];
        let bytes = 0;
        const reader = response.body.getReader();
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                bytes += chunk.value.length;
                if (bytes > maxBytes)
                    throw new Error('Bounded egress response exceeded limit');
                chunks.push(Buffer.from(chunk.value));
            }
        }
        finally {
            await reader.cancel().catch(() => { });
            reader.releaseLock();
        }
        const headers: Record<string, string> = {};
        for (const name of ['content-type', 'last-modified', 'etag', 'location']) {
            const value = response.headers.get(name);
            if (value)
                headers[name] = value;
        }
        const status = Number(response.headers.get('x-moflo-status'));
        if (!Number.isInteger(status) || status < 100 || status > 599)
            throw new Error('Invalid bounded egress response');
        return { status, headers, body: Buffer.concat(chunks) };
    };
}
