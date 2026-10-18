import { crawlLimits } from '../../lib/config/crawl-limits';
import { MAX_CRAWL_DELAY_MS } from './robots';
const configured = crawlLimits();
/** Time (ms) and byte limits for one crawl, from the crawl-limits settings. */
export const CRAWL_LIMITS = { fetchMs: configured.fetchMs, renderMs: configured.renderMs, jobMs: configured.timeBudgetMs, htmlBytes: configured.maxHtmlBytes, designBytes: configured.maxDesignBytes };
export const clampDocumentLimit = (value?: number): number => { const limits = crawlLimits(); return Math.min(limits.maxPages, Math.max(1, value ?? limits.defaultPages)); };
export const clampDepthLimit = (value?: number): number => { const limits = crawlLimits(); return Math.min(limits.maxDepth, Math.max(0, value ?? limits.defaultDepth)); };
const TIME_BUDGET_MARGIN_MS = 60_000;
/**
 * The crawl time budget, grown when a Crawl-delay makes the document limit unreachable in the base budget:
 * delay x documents + 60 s, but never past the job timeout minus 60 s (and never below the base budget).
 */
export function effectiveTimeBudgetMs(baseMs: number, crawlDelayMs: number, documents: number, jobTimeoutMs: number): number {
    const paced = Math.min(crawlDelayMs, MAX_CRAWL_DELAY_MS) * documents;
    return paced <= baseMs ? baseMs : Math.max(baseMs, Math.min(paced + TIME_BUDGET_MARGIN_MS, jobTimeoutMs - TIME_BUDGET_MARGIN_MS));
}
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
    /** Time budget for this crawl; the configured one unless a Crawl-delay grew it. */
    timeBudgetMs: number = CRAWL_LIMITS.jobMs;
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
        if (Date.now() - this.startedAt >= this.timeBudgetMs) {
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
    /** Gives back a reservation for a page that was refused before any fetch. */
    release(reservation: Reservation) {
        if (!this.active.delete(reservation.id)) {
          throw new Error('Unknown or finished reservation');
        }
        this.reservedDesign -= reservation.designBytes;
        this.documents = Math.max(0, this.documents - 1);
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
