export const CRAWL_LIMITS = { fetchMs: 15000, renderMs: 25000, jobMs: 300000, htmlBytes: 2 * 1024 * 1024, designBytes: 15 * 1024 * 1024 } as const;
export const clampDocumentLimit = (value?: number): number => Math.min(25, Math.max(1, value ?? 10));
export const clampDepthLimit = (value?: number): number => Math.min(3, Math.max(0, value ?? 2));
export interface BudgetSnapshot {
    documents: number;
    htmlBytes: number;
    designBytes: number;
    startedAt: number;
    limitsReached: string[];
}
export interface Reservation {
    id: number;
    htmlBytes: number;
    designBytes: number;
}
export class CrawlBudgets {
    readonly limitsReached = new Set<string>();
    private documents = 0;
    private htmlBytes = 0;
    private designBytes = 0;
    private reservedDesign = 0;
    private counter = 0;
    private active = new Map<number, Reservation>();
    readonly startedAt: number;
    readonly documentLimit: number;
    readonly depthLimit: number;
    constructor(options: {
        documentLimit?: number;
        depthLimit?: number;
    } = {}, snapshot?: BudgetSnapshot) { this.documentLimit = clampDocumentLimit(options.documentLimit); this.depthLimit = clampDepthLimit(options.depthLimit); this.startedAt = snapshot?.startedAt ?? Date.now(); if (snapshot) {
        this.documents = snapshot.documents;
        this.htmlBytes = snapshot.htmlBytes;
        this.designBytes = snapshot.designBytes;
        for (const limit of snapshot.limitsReached) {
          this.limitsReached.add(limit);
        }
    } }
    reserve(depth: number, designBytes = 0): Reservation {
        const fail = (limit: string): never => { this.limitsReached.add(limit); throw new Error('Crawl budget exceeded: ' + limit); };
        if (Date.now() - this.startedAt >= CRAWL_LIMITS.jobMs) {
          fail('time');
        }
        if (depth > this.depthLimit) {
          fail('depth');
        }
        if (this.documents >= this.documentLimit) {
          fail('documents');
        }
        if (designBytes < 0 || designBytes + this.designBytes + this.reservedDesign > CRAWL_LIMITS.designBytes) {
          fail('design_bytes');
        }
        const reservation = { id: ++this.counter, htmlBytes: CRAWL_LIMITS.htmlBytes, designBytes };
        this.documents++;
        this.reservedDesign += designBytes;
        this.active.set(reservation.id, reservation);
        return reservation;
    }
    finish(reservation: Reservation, htmlBytes: number, designBytes = 0) {
        if (!this.active.delete(reservation.id)) {
          throw new Error('Unknown or finished reservation');
        }
        this.reservedDesign -= reservation.designBytes;
        if (htmlBytes < 0 || htmlBytes > reservation.htmlBytes || designBytes < 0 || designBytes > reservation.designBytes) {
            this.limitsReached.add('bytes');
            throw new Error('Capture exceeded reserved bytes');
        }
        this.htmlBytes += htmlBytes;
        this.designBytes += designBytes;
    }
    snapshot(): BudgetSnapshot { return { documents: this.documents, htmlBytes: this.htmlBytes, designBytes: this.designBytes, startedAt: this.startedAt, limitsReached: [...this.limitsReached] }; }
}
