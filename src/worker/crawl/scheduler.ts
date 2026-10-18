import { setTimeout as delay } from 'node:timers/promises';
import { CRAWL_LIMITS } from './budgets';
import { crawlLimits } from '../../lib/config/crawl-limits';
const MAX_TIMER_MS = 2 ** 31 - 1; // larger timer delays overflow and fire after 1 ms
/** A required pacing wait that cannot fit before the task/job deadline. */
export interface Deadline { at: number; scope: 'job' | 'task' }
export class DeadlineError extends Error {
    readonly code = 'deadline_exceeded';
    constructor(message = 'Required pacing wait exceeds the remaining crawl time', readonly scope: Deadline['scope'] = 'task') { super(message); this.name = 'DeadlineError'; }
}
/** Pauses the single-fetch timeout while the caller waits on something that is not the fetch (a pacing gap). */
class FetchClock {
    private readonly controller = new AbortController();
    private timer: ReturnType<typeof setTimeout> | undefined;
    private left: number;
    private since = 0;
    constructor(ms: number) { this.left = ms; this.resume(); }
    get signal() { return this.controller.signal; }
    private resume() {
        if (this.controller.signal.aborted) {
          return;
        }
        this.since = Date.now();
        this.timer = setTimeout(() => { this.controller.abort(new DOMException('The operation timed out', 'TimeoutError')); }, Math.max(1, this.left));
    }
    private pause() { clearTimeout(this.timer); this.left -= Date.now() - this.since; }
    stop() { clearTimeout(this.timer); }
    async untimed<T>(work: () => Promise<T>): Promise<T> {
        this.pause();
        try {
            return await work();
        }
        finally {
            this.resume();
        }
    }
}
/** Runs a wait that does not count against the single-fetch timeout (a pacing gap before a redirect hop). */
export type Untimed = <T>(work: () => Promise<T>) => Promise<T>;
class Semaphore {
    private active = 0;
    private waiting: (() => void)[] = [];
    constructor(private readonly limit: number) { }
    async run<T>(callback: () => Promise<T>, signal: AbortSignal): Promise<T> {
        while (this.active >= this.limit) {
            await new Promise<void>((resolve, reject) => { const abort = () => { this.waiting = this.waiting.filter(w => w !== wake); reject(signal.reason); }; const wake = () => { signal.removeEventListener('abort', abort); resolve(); }; this.waiting.push(wake); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) {
              abort();
            } });
        }
        signal.throwIfAborted();
        this.active++;
        try {
            return await callback();
        }
        finally {
            this.active--;
            this.waiting.shift()?.();
        }
    }
}
export class Scheduler {
    private http = new Semaphore(crawlLimits().httpConcurrency);
    private render = new Semaphore(crawlLimits().renderConcurrency);
    private hostQueues = new Map<string, Promise<void>>();
    private starts = new Map<string, number>();
    readonly signal: AbortSignal;
    private readonly deadline = new AbortController();
    private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly createdAt = Date.now();
    constructor(signal?: AbortSignal, remainingMs: number = CRAWL_LIMITS.jobMs) {
        this.armDeadline(Math.max(1, Math.min(CRAWL_LIMITS.jobMs, remainingMs)));
        this.signal = AbortSignal.any([this.deadline.signal, ...(signal ? [signal] : [])]);
    }
    private armDeadline(ms: number) {
        this.deadlineTimer = setTimeout(() => { this.deadline.abort(new DOMException('The operation timed out', 'TimeoutError')); }, Math.min(MAX_TIMER_MS, ms));
        this.deadlineTimer.unref?.();
    }
    /** Moves the job deadline to `totalMs` after this scheduler started (a longer budget for a long Crawl-delay). */
    extendDeadline(totalMs: number) {
        if (this.deadline.signal.aborted) {
          return;
        }
        clearTimeout(this.deadlineTimer);
        this.armDeadline(Math.max(1, totalMs - (Date.now() - this.createdAt)));
    }
    async pace(input: string, gapMs = crawlLimits().hostGapMs, signal = this.signal, deadline?: Deadline) { const host = new URL(input).hostname; const prior = this.hostQueues.get(host) ?? Promise.resolve(); let release!: () => void; const turn = new Promise<void>(resolve => { release = resolve; }); this.hostQueues.set(host, turn); try {
        // The wait for earlier same-host requests is abortable; our turn is still released only after they finish.
        await new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
              reject(signal.reason); return;
            }
            const abort = () => { reject(signal.reason); };
            signal.addEventListener('abort', abort, { once: true });
            void prior.then(() => { signal.removeEventListener('abort', abort); resolve(); });
        });
        signal.throwIfAborted();
        const wait = (this.starts.get(host) ?? 0) + Math.min(MAX_TIMER_MS, Math.max(crawlLimits().hostGapMs, gapMs)) - Date.now();
        if (wait > 0 && deadline && Date.now() + wait > deadline.at) {
          throw new DeadlineError(undefined, deadline.scope);
        }
        if (wait > 0) {
          await delay(wait, undefined, { signal });
        }
        this.starts.set(host, Date.now());
    }
    finally {
        void prior.then(() => { release(); if (this.hostQueues.get(host) === turn) {
          this.hostQueues.delete(host);
        } });
    } }
    runHttp<T>(url: string, callback: (signal: AbortSignal, untimed: Untimed) => Promise<T>, delayMs = crawlLimits().hostGapMs, signal?: AbortSignal, skipInitialPacing = false, deadline?: Deadline): Promise<T> { const combined = AbortSignal.any([this.signal, ...(signal ? [signal] : [])]); return this.http.run(async () => { if (!skipInitialPacing) {
      await this.pace(url, delayMs, combined, deadline);
    } const clock = new FetchClock(CRAWL_LIMITS.fetchMs); try {
      return await callback(AbortSignal.any([combined, clock.signal]), work => clock.untimed(work));
    }
    finally {
      clock.stop();
    } }, combined); }
    runRender<T>(callback: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> { const combined = AbortSignal.any([this.signal, ...(signal ? [signal] : [])]); return this.render.run(() => callback(AbortSignal.any([combined, AbortSignal.timeout(CRAWL_LIMITS.renderMs)])), combined); }
}
