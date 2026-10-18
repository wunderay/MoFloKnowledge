import { resolve4, resolve6 } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { NetworkPolicyError, normalizeUrl } from './url-scope';
export interface Address {
    address: string;
    family: 4 | 6;
}
export type Resolver = (hostname: string) => Promise<Address[]>;
export function isGlobalAddress(address: string): boolean {
    try {
        let parsed = ipaddr.parse(address);
        if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
          parsed = (parsed as ipaddr.IPv6).toIPv4Address();
        }
        if (parsed.range() !== 'unicast') {
          return false;
        }
        if (parsed.kind() === 'ipv6') {
            // IANA IPv6 Global Unicast/Special-Purpose registries: stay within allocated
            // global space and conservatively reject the protocol-assignment and new
            // documentation blocks even if the pinned classifier has not learned them.
            const v6 = parsed as ipaddr.IPv6;
            if (!v6.match(ipaddr.IPv6.parseCIDR('2000::/3'))) {
              return false;
            }
            if (['2001::/23', '3fff::/20'].some(cidr => v6.match(ipaddr.IPv6.parseCIDR(cidr)))) {
              return false;
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
const resolveAll: Resolver = async (hostname) => {
    const results = await Promise.all([resolve4(hostname), resolve6(hostname)].map(async (request) => {
        try {
            return await request;
        }
        catch (error) {
            if (['ENODATA', 'ENOTFOUND'].includes((error as NodeJS.ErrnoException).code ?? '')) {
              return [];
            }
            throw error;
        }
    }));
    return [...results[0].map(address => ({ address, family: 4 as const })), ...results[1].map(address => ({ address, family: 6 as const }))];
};
export async function approveDestination(input: string, resolver: Resolver = resolveAll): Promise<{
    url: URL;
    addresses: Address[];
}> {
    const url = new URL(normalizeUrl(input));
    const addresses = await resolver(url.hostname);
    if (!addresses.length || addresses.some(({ address }) => !isGlobalAddress(address))) {
      throw new NetworkPolicyError('DNS destination is not exclusively global');
    }
    return { url, addresses };
}
