import { clampDepthLimit, clampDocumentLimit } from './budgets';
import { crawlLimits } from '../../lib/config/crawl-limits';
import { assertDocumentScope, documentPathPrefix, documentScope, isUtilitySubpage, normalizeUrl } from '../network/url-scope';
export interface FrontierItem {
    url: string;
    depth: number;
    score: number;
}
export interface FrontierSnapshot {
    root: string;
    pending: FrontierItem[];
    seen: string[];
    aliases: [
        string,
        string
    ][];
    selected: number;
    limitsReached: string[];
}
/** Funnel kinds whose pages stop outranking service pages after FUNNEL_CAP of them are queued. */
const FUNNEL_CAP = 2;
const NEUTRAL_SCORE = 50;
/** Unknown pages linked from the main navigation outrank unknown body links but not funnel pages. */
const NAV_SCORE = 75;
interface Relevance {
    score: number;
    funnel?: string;
}
function relevance(url: string, label: string, pathPrefix = '', nav = false): Relevance {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const words = `${path.replace(/[^a-z]+/g, ' ')} ${label.toLowerCase()}`;
    // Specific destinations take precedence over an inherited parent-path keyword.
    if (/\b(?:join (?:our team|us)|we'?re hiring|now hiring)\b/.test(words)) {
      return { score: 5 };
    }
    if (/\b(?:privacy|terms|legal|login|sign in|client hub|cart|checkout)\b/.test(words)) {
      return { score: 5 };
    }
    if (/^\/(?:blog|news|articles?|learning-center)(?:\/|$)/.test(path)) {
      return { score: 10 };
    }
    // Funnel pages (appointment, referral, contact) outrank repeated service detail pages.
    if (/\b(?:referrals?|appointment|schedule|booking|book(?: a)?)\b/.test(words)) {
      return { score: 88, funnel: 'appointment' };
    }
    if (/\b(?:quote|estimate)\b/.test(words)) {
      return { score: 92, funnel: 'quote' };
    }
    if (/\b(?:testimonials?|reviews?)\b/.test(words)) {
      return { score: 91, funnel: 'testimonials' };
    }
    if (/\b(?:financing|finance|payments?)\b/.test(words)) {
      return { score: 89, funnel: 'financing' };
    }
    if (/\b(?:newsletter|subscribe)\b/.test(words)) {
      return { score: 45 };
    }
    if (/\b(?:contact|locations?)\b/.test(words)) {
      return { score: 90, funnel: 'contact' };
    }
    if (/\b(?:about|company|firm|background|team|staff|bios?|people|employees?|leadership|founder)\b/.test(words)) {
      return { score: path.split('/').filter(Boolean).length <= 1 ? 100 : 85 };
    }
    if (/\b(?:services?|products?|offerings?|solutions?|pricing)\b/.test(words)) {
      return { score: path.split('/').filter(Boolean).length <= 1 ? 95 : 80 };
    }
    // Pages that are rarely useful; checked after the funnel and service rules so a service named
    // with one of these words is not demoted.
    if (/\b(?:portal|hub|careers?|jobs?|videos?|media|gallery|diagrams?)\b/.test(words)) {
      return { score: 5 };
    }
    if (/\b(?:troubleshooting|sitemap|search)\b/.test(words)) {
      return { score: 3 };
    }
    if (/\b(?:faq|brand)\b/.test(words)) {
      return { score: 65 };
    }
    // A direct child of a start path (a repository under a profile) is that profile's own content.
    const prefixDepth = pathPrefix.split('/').filter(Boolean).length;
    if (prefixDepth > 0 && path.split('/').filter(Boolean).length === prefixDepth + 1) {
      return { score: 70 };
    }
    // An unknown top-level page of the site gets a neutral middle score.
    if (path.split('/').filter(Boolean).length === 1) {
      return { score: nav ? NAV_SCORE : NEUTRAL_SCORE };
    }
    // Lowest plain-path score; stays above VARIANT_SCORE so checkpoint scores are never negative.
    return { score: nav ? NAV_SCORE : 1 };
}
/** Url identity for seen checks: a trailing slash on a non-root path is ignored. */
function slashKey(url: string): string {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
    return parsed.origin + path + parsed.search;
}
/** Query-string variants of a path rank below every plain path (0 keeps scores non-negative). */
const VARIANT_SCORE = 0;
export class Frontier {
    readonly scope: string[];
    readonly pathPrefix: string;
    readonly limitsReached = new Set<string>();
    private pending: FrontierItem[] = [];
    private seen = new Set<string>();
    private aliases = new Map<string, string>();
    /** Seen urls with the trailing slash dropped, so /contact and /contact/ count once. */
    private seenKeys = new Set<string>();
    private selected = 0;
    /** Pages queued per funnel kind during this crawl. */
    private funnelCounts = new Map<string, number>();
    readonly documentLimit: number;
    readonly depthLimit: number;
    constructor(readonly root: string, options: {
        documentLimit?: number;
        depthLimit?: number;
    } = {}, snapshot?: FrontierSnapshot) {
        this.scope = documentScope(root);
        this.pathPrefix = documentPathPrefix(root);
        this.documentLimit = clampDocumentLimit(options.documentLimit);
        this.depthLimit = clampDepthLimit(options.depthLimit);
        if (snapshot) {
            this.pending = [...snapshot.pending];
            this.seen = new Set(snapshot.seen);
            this.seenKeys = new Set(snapshot.seen.map(slashKey));
            this.aliases = new Map(snapshot.aliases);
            this.selected = snapshot.selected;
            for (const limit of snapshot.limitsReached) {
              this.limitsReached.add(limit);
            }
        }
        else {
          this.add(root, '', 0);
        }
    }
    get size() { return this.pending.length; }
    /** True when the link is in scope and has not been seen yet. */
    isNew(input: string): boolean {
        try {
            const url = assertDocumentScope(normalizeUrl(input, this.root), this.scope, this.pathPrefix);
            return !this.isKnown(url);
        }
        catch {
            return false;
        }
    }
    get remaining() { return Math.max(0, this.documentLimit - this.selected); }
    /** `rank` (0 = first) puts a link ahead of the usual relevance order at its depth. */
    add(input: string, label: string, depth: number, rank?: number, nav = false): boolean {
        let url: string;
        try {
            url = assertDocumentScope(normalizeUrl(input, this.root), this.scope, this.pathPrefix);
        }
        catch {
            return false;
        }
        if (this.isKnown(url)) {
          return false;
        }
        if (isUtilitySubpage(new URL(url).pathname, this.pathPrefix)) {
            return false;
        }
        if (depth > this.depthLimit) {
            this.limitsReached.add('depth');
            return false;
        }
        if (this.seen.size >= crawlLimits().maxDiscovered) {
            this.limitsReached.add('discovery');
            return false;
        }
        const isVariant = new URL(url).search !== '';
        if (isVariant && this.hasVariant(url)) {
            return false;
        }
        this.seen.add(url);
        this.seenKeys.add(slashKey(url));
        let score: number;
        if (rank !== undefined) {
            score = 200 - Math.min(rank, 99);
        }
        else if (isVariant) {
            score = VARIANT_SCORE;
        }
        else {
            const found = relevance(url, label, this.pathPrefix, nav);
            score = found.score;
            if (found.funnel) {
                // Past the cap, more pages of one funnel kind are treated as unknown pages.
                const queued = this.funnelCounts.get(found.funnel) ?? 0;
                this.funnelCounts.set(found.funnel, queued + 1);
                if (queued >= FUNNEL_CAP) {
                    score = NEUTRAL_SCORE;
                }
            }
        }
        this.pending.push({ url, depth, score });
        return true;
    }
    private isKnown(url: string): boolean {
        return this.seen.has(url) || this.aliases.has(url) || this.seenKeys.has(slashKey(url));
    }
    /** True when another query-string variant of the same path was already queued or seen. */
    private hasVariant(url: string): boolean {
        const key = (value: string) => { const parsed = new URL(value); return parsed.origin + parsed.pathname; };
        const target = key(url);
        for (const other of this.seen) {
            if (other !== url && new URL(other).search !== '' && key(other) === target) {
                return true;
            }
        }
        return false;
    }
    /** Gives back a selection that was refused (robots) so it does not use up the document limit. */
    release() { this.selected = Math.max(0, this.selected - 1); this.limitsReached.delete('documents'); }
    next(): FrontierItem | undefined {
        if (this.selected >= this.documentLimit) {
            if (this.pending.length) {
              this.limitsReached.add('documents');
            }
            return;
        }
        this.pending.sort((a, b) => a.depth - b.depth || b.score - a.score || a.url.localeCompare(b.url));
        let next = this.pending.shift();
        while (next && (this.aliases.has(next.url) || !this.inScope(next.url))) {
          next = this.pending.shift();
        }
        if (next) {
          this.selected++;
        }
        return next;
    }
    private inScope(url: string): boolean {
        try {
            assertDocumentScope(url, this.scope, this.pathPrefix);
            return true;
        }
        catch {
            return false;
        }
    }
    alias(from: string, to: string) { const normalized = assertDocumentScope(to, this.scope, this.pathPrefix); if (from !== normalized) {
      this.aliases.set(normalizeUrl(from), normalized);
    } this.seen.add(normalized); this.seenKeys.add(slashKey(normalized)); this.pending = this.pending.filter(item => slashKey(item.url) !== slashKey(normalized)); }
    snapshot(): FrontierSnapshot { return { root: this.root, pending: [...this.pending], seen: [...this.seen], aliases: [...this.aliases], selected: this.selected, limitsReached: [...this.limitsReached] }; }
}
