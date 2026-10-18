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
function relevance(url: string, label: string, pathPrefix = ''): number {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const words = `${path.replace(/[^a-z]+/g, ' ')} ${label.toLowerCase()}`;
    // Specific destinations take precedence over an inherited parent-path keyword.
    if (/\b(?:privacy|terms|legal|login|sign in|client hub|portal|hub|careers?|jobs?|cart|checkout|videos?|media|gallery|diagrams?)\b/.test(words)) {
      return 5;
    }
    // Utility pages with little content of their own.
    if (/\b(?:troubleshooting|sitemap|search)\b/.test(words)) {
      return 3;
    }
    if (/^\/(?:blog|news|articles?|learning-center)(?:\/|$)/.test(path)) {
      return 10;
    }
    // Funnel pages (appointment, referral, contact) outrank repeated service detail pages.
    if (/\b(?:referrals?|appointment|schedule|booking|book(?: a)?)\b/.test(words)) {
      return 88;
    }
    if (/\b(?:quote|estimate|request)\b/.test(words)) {
      return 92;
    }
    if (/\b(?:testimonials?|reviews?)\b/.test(words)) {
      return 91;
    }
    if (/\b(?:financing|finance|payments?)\b/.test(words)) {
      return 89;
    }
    if (/\b(?:newsletter|subscribe)\b/.test(words)) {
      return 45;
    }
    if (/\b(?:contact|locations?)\b/.test(words)) {
      return 90;
    }
    if (/\b(?:about|company|firm|background|team|staff|bios?|people|employees?|leadership|founder)\b/.test(words)) {
      return path.split('/').filter(Boolean).length <= 1 ? 100 : 85;
    }
    if (/\b(?:services?|products?|offerings?|solutions?|pricing)\b/.test(words)) {
      return path.split('/').filter(Boolean).length <= 1 ? 95 : 80;
    }
    // Service detail pages named by their path words or menu labels.
    if (/\b(?:drilling|pumps?|pumping|installation|installations|repairs?|inspections?|maintenance|replacement|treatment|testing)\b/.test(words)) {
      return 75;
    }
    if (/\b(?:faq|brand)\b/.test(words)) {
      return 65;
    }
    // A direct child of a start path (a repository under a profile) is that profile's own content.
    const prefixDepth = pathPrefix.split('/').filter(Boolean).length;
    if (prefixDepth > 0 && path.split('/').filter(Boolean).length === prefixDepth + 1) {
      return 70;
    }
    // Lowest plain-path score; stays above VARIANT_SCORE so checkpoint scores are never negative.
    return 1;
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
    add(input: string, label: string, depth: number, rank?: number): boolean {
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
        const score = rank !== undefined ? 200 - Math.min(rank, 99) : isVariant ? VARIANT_SCORE : relevance(url, label, this.pathPrefix);
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
    } this.seen.add(normalized); this.seenKeys.add(slashKey(normalized)); this.pending = this.pending.filter(item => item.url !== normalized); }
    snapshot(): FrontierSnapshot { return { root: this.root, pending: [...this.pending], seen: [...this.seen], aliases: [...this.aliases], selected: this.selected, limitsReached: [...this.limitsReached] }; }
}
