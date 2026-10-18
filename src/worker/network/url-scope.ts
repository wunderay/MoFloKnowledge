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
    return domain && (host === domain || host === `www.${domain}`) ? [domain, `www.${domain}`] : [host];
}
/** Start URL path without a trailing slash ("" for the site root). */
export function documentPathPrefix(input: string): string {
    return new URL(normalizeUrl(input)).pathname.replace(/\/+$/, '');
}
/** Pages are in scope at the prefix itself or below it; "" allows the whole host. */
export function assertDocumentScope(input: string, scope: readonly string[], pathPrefix = ''): string {
    const url = normalizeUrl(input);
    const { hostname, pathname } = new URL(url);
    if (!scope.includes(hostname) || (pathPrefix && pathname !== pathPrefix && !pathname.startsWith(`${pathPrefix}/`))) {
      throw new NetworkPolicyError('Document redirect or link is outside company scope');
    }
    return url;
}
