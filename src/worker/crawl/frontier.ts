import { assertDocumentScope, documentScope, normalizeUrl } from '../network/url-scope';
export type FrontierItem = {
    url: string;
    depth: number;
    score: number;
};
export type FrontierSnapshot = {
    root: string;
    pending: FrontierItem[];
    seen: string[];
    aliases: [
        string,
        string
    ][];
    selected: number;
    limitsReached: string[];
};
export class Frontier {
    readonly scope: string[];
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
        this.documentLimit = Math.max(1, Math.min(25, options.documentLimit ?? 10));
        this.depthLimit = Math.max(0, Math.min(3, options.depthLimit ?? 2));
        if (snapshot) {
            this.pending = [...snapshot.pending];
            this.seen = new Set(snapshot.seen);
            this.aliases = new Map(snapshot.aliases);
            this.selected = snapshot.selected;
            for (const limit of snapshot.limitsReached)
                this.limitsReached.add(limit);
        }
        else
            this.add(root, '', 0);
    }
    get size() { return this.pending.length; }
    add(input: string, label: string, depth: number): boolean {
        let url: string;
        try {
            url = assertDocumentScope(normalizeUrl(input, this.root), this.scope);
        }
        catch {
            return false;
        }
        if (this.seen.has(url) || this.aliases.has(url))
            return false;
        if (depth > this.depthLimit) {
            this.limitsReached.add('depth');
            return false;
        }
        if (this.seen.size >= 200) {
            this.limitsReached.add('discovery');
            return false;
        }
        this.seen.add(url);
        const words = (new URL(url).pathname + ' ' + label).toLowerCase();
        const score = ['about', 'product', 'service', 'pricing', 'contact', 'faq', 'team', 'location', 'brand'].reduce((n, word, index) => n + (words.includes(word) ? 20 - index : 0), 0);
        this.pending.push({ url, depth, score });
        return true;
    }
    next(): FrontierItem | undefined {
        if (this.selected >= this.documentLimit) {
            if (this.pending.length)
                this.limitsReached.add('documents');
            return;
        }
        this.pending.sort((a, b) => a.depth - b.depth || b.score - a.score || a.url.localeCompare(b.url));
        let next = this.pending.shift();
        while (next && this.aliases.has(next.url))
            next = this.pending.shift();
        if (next)
            this.selected++;
        return next;
    }
    alias(from: string, to: string) { const normalized = assertDocumentScope(to, this.scope); if (from !== normalized)
        this.aliases.set(normalizeUrl(from), normalized); this.seen.add(normalized); this.pending = this.pending.filter(item => item.url !== normalized); }
    snapshot(): FrontierSnapshot { return { root: this.root, pending: [...this.pending], seen: [...this.seen], aliases: [...this.aliases], selected: this.selected, limitsReached: [...this.limitsReached] }; }
}
