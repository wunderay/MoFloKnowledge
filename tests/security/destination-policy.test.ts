import { describe, it, expect } from 'vitest';
import { approveDestination, isGlobalAddress } from '../../src/worker/network/destination-policy';
import { normalizeUrl, documentScope, assertDocumentScope } from '../../src/worker/network/url-scope';
describe('destination boundary', () => {
    it('normalizes WHATWG URLs without losing meaningful distinctions', () => {
        expect(normalizeUrl('HTTPS://EXAMPLE.COM:443/about/?b=2&utm_source=x&a=1#top')).toBe('https://example.com/about/?a=1&b=2');
        expect(normalizeUrl('https://münich.de')).toBe('https://xn--mnich-kva.de/');
        expect(normalizeUrl('https://example.com/a')).not.toBe(normalizeUrl('https://example.com/a/'));
        for (const input of ['http://127.1', 'http://0x7f000001', 'http://[::1]', 'http://localhost', 'http://foo', 'https://a:b@example.com', 'https://example.com:444']) {
          expect(() => normalizeUrl(input)).toThrow();
        }
    });
    it('uses offline PSL for only bare/www redirect aliases', () => {
        expect(documentScope('https://example.co.uk')).toEqual(['example.co.uk', 'www.example.co.uk']);
        expect(documentScope('https://team.example.co.uk')).toEqual(['team.example.co.uk']);
        expect(documentScope('https://tenant.github.io')).toEqual(['tenant.github.io', 'www.tenant.github.io']);
        expect(() => assertDocumentScope('https://evil.example.co.uk', documentScope('https://example.co.uk'))).toThrow();
    });
    it('denies representative non-global and mixed answers including mapped IPv6', async () => {
        for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff00::1', '2001:db8::1', '::ffff:127.0.0.1', '64:ff9b:1::7f00:1', '4000::1', '3fff::1']) {
          expect(isGlobalAddress(ip), ip).toBe(false);
        }
        expect(isGlobalAddress('1.1.1.1')).toBe(true);
        expect(isGlobalAddress('2606:4700:4700::1111')).toBe(true);
        await expect(approveDestination('https://example.com', async () => [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }])).rejects.toThrow();
        let calls = 0;
        const resolver = async () => [{ address: ++calls === 1 ? '1.1.1.1' : '127.0.0.1', family: 4 as const }];
        await approveDestination('https://example.com', resolver);
        await expect(approveDestination('https://example.com', resolver)).rejects.toThrow();
    });
});
