import { fetchDocument, type FetchOptions, type FetchResult } from '../network/pinned-transport';
import { crawlLimits } from '../../lib/config/crawl-limits';
import { assertDocumentScope, documentScope } from '../network/url-scope';
const gap = () => crawlLimits().hostGapMs;
export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResult>;
export interface RobotsDecision {
    allowed: boolean;
    delayMs: number;
    limitation?: string;
}
interface Rule {
    allow: boolean;
    pattern: string;
}
// Untrusted Crawl-delay is honoured as the gap between requests to a host, up to this cap; a larger value counts as the cap.
export const MAX_CRAWL_DELAY_MS = 60_000;
const MAX_ROBOTS_REDIRECTS = 5;
export function parseRobots(text: string): {
    rules: Rule[];
    delayMs: number;
} {
    const groups: {
        agents: string[];
        rules: Rule[];
        delayMs: number;
    }[] = [];
    let group: typeof groups[number] | undefined;
    let directives = false;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        const colon = line.indexOf(':');
        if (colon < 0) {
          continue;
        }
        const key = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
        if (key === 'user-agent') {
            if (!group || directives) {
                group = { agents: [], rules: [], delayMs: gap() };
                groups.push(group);
                directives = false;
            }
            group.agents.push(value.toLowerCase());
        }
        else if (group) {
            directives = true;
            if ((key === 'allow' || key === 'disallow') && value) {
                if(value.length>2048 || groups.reduce((count,item)=>count+item.rules.length,0)>=1000) {
                  throw new Error('Robots rules exceed bounded parser capacity');
                }
                group.rules.push({ allow: key === 'allow', pattern: value });
            }
            if (key === 'crawl-delay' && Number.isFinite(Number(value))) {
              group.delayMs = Math.min(MAX_CRAWL_DELAY_MS, Math.max(gap(), Number(value) * 1000));
            }
        }
    }
    const specificity=(agents:string[])=>Math.max(0,...agents.filter(agent=>agent&&agent!=='*'&&'mofloknowledgebot'.startsWith(agent)).map(agent=>agent.length));
    const maximum=Math.max(0,...groups.map(group=>specificity(group.agents)));
    const selected=maximum?groups.filter(group=>specificity(group.agents)===maximum):groups.filter(group=>group.agents.includes('*'));
    return { rules: selected.flatMap(g => g.rules), delayMs: Math.max(gap(), ...selected.map(g => g.delayMs)) };
}
// RFC 9309 octet comparison: encode non-ASCII and normalize only unreserved
// percent encodings. Reserved encoded separators remain distinct from '/'.
function robotsOctets(value:string):string {
    return value.replace(/[^\x00-\x7f]/gu,char=>encodeURIComponent(char)).replace(/%([a-f0-9]{2})/gi,(_match,hex:string)=>{const char=String.fromCharCode(parseInt(hex,16));return /[A-Za-z0-9._~-]/.test(char)?char:'%'+hex.toUpperCase();});
}
function wildcardPrefix(path:string,pattern:string):boolean {
    const anchored=pattern.endsWith('$');const parts=(anchored?pattern.slice(0,-1):pattern).split('*');const first=parts[0];
    if(!path.startsWith(first)) {
      return false;
    }
    if(parts.length===1) {
      return !anchored||path===first;
    }
    let offset=first.length;
    for(let index=1;index<parts.length;index++){
        const part=parts[index];
        if(index===parts.length-1&&anchored){const start=path.length-part.length;return start>=offset&&path.endsWith(part);}
        const found=path.indexOf(part,offset);if(found<0) {
          return false;
        }offset=found+part.length;
    }
    return true;
}
export function robotsAllows(path: string, rules: Rule[]): boolean {
    const normalized=robotsOctets(path);
    const matches=rules.map(rule=>({...rule,pattern:robotsOctets(rule.pattern)})).filter(rule=>wildcardPrefix(normalized,rule.pattern));
    matches.sort((a, b) => b.pattern.replace(/[\*$]/g, '').length - a.pattern.replace(/[\*$]/g, '').length || Number(b.allow) - Number(a.allow));
    return matches[0]?.allow ?? true;
}
export function retryAfterMs(value: string | undefined, now = Date.now()): number {
    if (!value) {
      return 500;
    }
    const seconds = Number(value);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    return Math.max(500, Math.min(10000, Number.isFinite(ms) ? ms : 500));
}
export class RobotsCache {
    private cache = new Map<string, Promise<{
        rules: Rule[];
        delayMs: number;
        blocked?: string;
    }>>();
    // `loadSignal` bounds the shared robots.txt loads (job level); each caller's `signal` only bounds its own wait,
    // so one caller's expired task deadline never poisons the cached load for the others.
    constructor(private readonly fetcher: Fetcher = fetchDocument, private readonly onRequest?: FetchOptions['onRequest'], private readonly loadSignal?: AbortSignal) { }
    async check(input: string, signal?: AbortSignal): Promise<RobotsDecision> {
        const url = new URL(input);
        signal?.throwIfAborted();
        let loading = this.cache.get(url.origin);
        if (!loading) {
            loading = this.load(url.origin, this.loadSignal);
            this.cache.set(url.origin, loading);
            loading.catch(() => this.cache.get(url.origin) === loading && this.cache.delete(url.origin));
        }
        const policy = await abortable(loading, signal);
        return { allowed: !policy.blocked && robotsAllows(url.pathname + url.search, policy.rules), delayMs: policy.delayMs, ...(policy.blocked ? { limitation: policy.blocked } : {}) };
    }
    /** Fetches robots.txt, following redirects that stay inside the site (apex and www); undefined for an off-site redirect. */
    private async fetchFollowingSiteRedirects(origin: string, signal?: AbortSignal): Promise<FetchResult | undefined> {
        const scope = documentScope(origin);
        let current = origin + '/robots.txt';
        for (let hop = 0; ; hop++) {
            const response = await this.fetcher(current, { scope, signal, maxBytes: 512 * 1024, onRequest: this.onRequest, redirect: 'manual' });
            const location = response.headers.location;
            if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
                return response;
            }
            if (hop >= MAX_ROBOTS_REDIRECTS) {
                throw new Error('Too many robots.txt redirects');
            }
            try {
                current = assertDocumentScope(new URL(location, current).href, scope);
            }
            catch {
                return undefined;
            }
        }
    }
    private async load(origin: string, signal?: AbortSignal) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await this.fetchFollowingSiteRedirects(origin, signal);
                if (!response) {
                  return { rules: [], delayMs: gap(), blocked: 'robots redirected outside the site' };
                }
                if (response.status === 404) {
                  return { rules: [], delayMs: gap() };
                }
                if ([401, 403].includes(response.status)) {
                  return { rules: [], delayMs: gap(), blocked: 'robots access denied' };
                }
                if (response.status >= 200 && response.status < 300) {
                  return parseRobots(response.body.toString('utf8'));
                }
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                  return { rules: [], delayMs: gap(), blocked: 'robots unavailable' };
                }
                if (response.status === 429 && attempt === 0) {
                  await new Promise<void>((resolve, reject) => {
                        const abort = () => { clearTimeout(timer); reject(signal?.reason); };
                        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, retryAfterMs(response.headers['retry-after']));
                        signal?.addEventListener('abort', abort, { once: true });
                    });
                }
            }
            catch (error) {
                if (signal?.aborted) {
                  throw error;
                }
            }
        }
        return { rules: [], delayMs: gap(), blocked: 'robots indeterminate after retry' };
    }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return promise;
    }
    return new Promise<T>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason); return;
        }
        const abort = () => { reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
