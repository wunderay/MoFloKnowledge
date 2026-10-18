import { clampDepthLimit, clampDocumentLimit } from './budgets';
import { assertDocumentScope, documentPathPrefix, documentScope, normalizeUrl } from '../network/url-scope';
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
function relevance(url: string, label: string): number {
    const path = new URL(url).pathname.toLowerCase();
    const words = `${path.replace(/[^a-z]+/g, ' ')} ${label.toLowerCase()}`;
    // Specific destinations take precedence over an inherited parent-path keyword.
    if (/\b(?:privacy|terms|legal|login|sign in|client hub)\b/.test(words)) {
      return 5;
    }
    if (/^\/(?:blog|news|articles?|learning-center)(?:\/|$)/.test(path)) {
      return 10;
    }
    if (/\b(?:referrals?|newsletter|subscribe)\b/.test(words)) {
      return 45;
    }
    if (/\b(?:appointment|schedule|booking|book a)\b/.test(words)) {
      return 55;
    }
    if (/\b(?:contact|locations?)\b/.test(words)) {
      return 90;
    }
    if (/\b(?:about|company|firm|background|team|leadership|founder)\b/.test(words)) {
      return path.split('/').filter(Boolean).length <= 1 ? 100 : 85;
    }
    if (/\b(?:services?|products?|offerings?|solutions?|pricing)\b/.test(words)) {
      return path.split('/').filter(Boolean).length <= 1 ? 95 : 80;
    }
    if (/\b(?:faq|brand)\b/.test(words)) {
      return 65;
    }
    return 0;
}
export class Frontier {
    readonly scope: string[];
    readonly pathPrefix: string;
    readonly limitsReached = new Set<string>();
    private pending: FrontierItem[] = [];
    private seen = new Set<string>();
    private aliases = new Map<string, string>();
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
            return !this.seen.has(url) && !this.aliases.has(url);
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
        if (this.seen.has(url) || this.aliases.has(url)) {
          return false;
        }
        if (depth > this.depthLimit) {
            this.limitsReached.add('depth');
            return false;
        }
        if (this.seen.size >= 200) {
            this.limitsReached.add('discovery');
            return false;
        }
        this.seen.add(url);
        const score = rank === undefined ? relevance(url, label) : 200 - Math.min(rank, 99);
        this.pending.push({ url, depth, score });
        return true;
    }
    next(): FrontierItem | undefined {
        if (this.selected >= this.documentLimit) {
            if (this.pending.length) {
              this.limitsReached.add('documents');
            }
            return;
        }
        this.pending.sort((a, b) => a.depth - b.depth || b.score - a.score || a.url.localeCompare(b.url));
        let next = this.pending.shift();
        while (next && this.aliases.has(next.url)) {
          next = this.pending.shift();
        }
        if (next) {
          this.selected++;
        }
        return next;
    }
    alias(from: string, to: string) { const normalized = assertDocumentScope(to, this.scope, this.pathPrefix); if (from !== normalized) {
      this.aliases.set(normalizeUrl(from), normalized);
    } this.seen.add(normalized); this.pending = this.pending.filter(item => item.url !== normalized); }
    snapshot(): FrontierSnapshot { return { root: this.root, pending: [...this.pending], seen: [...this.seen], aliases: [...this.aliases], selected: this.selected, limitsReached: [...this.limitsReached] }; }
}
