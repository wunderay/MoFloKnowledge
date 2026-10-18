import { isIP } from 'node:net';
import { getDomain, parse } from 'tldts';
export class NetworkPolicyError extends Error {
    readonly code = 'NETWORK_POLICY';
}
export function normalizeUrl(input: string, base?: string): string {
    const url = new URL(input, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
      throw new NetworkPolicyError('Only credential-free HTTP(S) on ports 80/443 is allowed');
    }
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
      throw new NetworkPolicyError('A public hostname is required');
    }
    const suffix = parse(url.hostname, { allowPrivateDomains: true });
    if (!suffix.domain || (!suffix.isIcann && !suffix.isPrivate)) {
      throw new NetworkPolicyError('Unrecognized public suffix');
    }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.href;
}
export function documentScope(input: string): string[] {
    const host = new URL(normalizeUrl(input)).hostname;
    const domain = getDomain(host, { allowPrivateDomains: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
    return host === domain || host === `www.${domain}` ? [domain!, `www.${domain}`] : [host];
}
export function assertDocumentScope(input: string, scope: readonly string[]): string {
    const url = normalizeUrl(input);
    if (!scope.includes(new URL(url).hostname)) {
      throw new NetworkPolicyError('Document redirect or link is outside company scope');
    }
    return url;
}
