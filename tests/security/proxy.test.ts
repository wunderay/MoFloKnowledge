import { it, expect } from 'vitest';
import { once } from 'node:events';
import net from 'node:net';
import { createEgressProxy } from '../../src/egress/proxy';
it('requires private proxy authentication and denies private CONNECT before opening a tunnel', async () => {
    const token = 't'.repeat(32);
    const server = createEgressProxy({ token });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as {
        port: number;
    }).port;
    const exchange = (request: string) => new Promise<string>((resolve, reject) => { const client = net.connect({ host: '127.0.0.1', port }); let received = ''; client.once('connect', () => client.write(request)); client.on('data', chunk => received += chunk.toString()); client.once('end', () => resolve(received)); client.once('error', reject); });
    try {
        expect(await exchange('GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n')).toContain('407');
        const auth = Buffer.from('moflo:' + token).toString('base64');
        expect(await exchange(`CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`)).not.toContain('200');
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
