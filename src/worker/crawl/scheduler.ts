import { setTimeout as delay } from 'node:timers/promises';
import { CRAWL_LIMITS } from './budgets';
const MAX_TIMER_MS = 2 ** 31 - 1; // larger timer delays overflow and fire after 1 ms
/** A required pacing wait that cannot fit before the task/job deadline. */
export type Deadline = { at: number; scope: 'job' | 'task' };
export class DeadlineError extends Error {
    readonly code = 'deadline_exceeded';
    constructor(message = 'Required pacing wait exceeds the remaining crawl time', readonly scope: Deadline['scope'] = 'task') { super(message); this.name = 'DeadlineError'; }
}
class Semaphore {
    private active = 0;
    private waiting: (() => void)[] = [];
    constructor(private readonly limit: number) { }
    async run<T>(callback: () => Promise<T>, signal: AbortSignal): Promise<T> {
        while (this.active >= this.limit) {
            await new Promise<void>((resolve, reject) => { const abort = () => { this.waiting = this.waiting.filter(w => w !== wake); reject(signal.reason); }; const wake = () => { signal.removeEventListener('abort', abort); resolve(); }; this.waiting.push(wake); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted)
                abort(); });
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
    private http = new Semaphore(3);
    private render = new Semaphore(1);
    private hostQueues = new Map<string, Promise<void>>();
    private starts = new Map<string, number>();
    readonly signal: AbortSignal;
    constructor(signal?: AbortSignal, remainingMs: number = CRAWL_LIMITS.jobMs) { this.signal = AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(CRAWL_LIMITS.jobMs, remainingMs))), ...(signal ? [signal] : [])]); }
    async pace(input: string, gapMs = 500, signal = this.signal, deadline?: Deadline) { const host = new URL(input).hostname; const prior = this.hostQueues.get(host) ?? Promise.resolve(); let release!: () => void; const turn = new Promise<void>(resolve => { release = resolve; }); this.hostQueues.set(host, turn); try {
        await prior;
        signal.throwIfAborted();
        const wait = (this.starts.get(host) ?? 0) + Math.min(MAX_TIMER_MS, Math.max(500, gapMs)) - Date.now();
        if (wait > 0 && deadline && Date.now() + wait > deadline.at)
            throw new DeadlineError(undefined, deadline.scope);
        if (wait > 0)
            await delay(wait, undefined, { signal });
        this.starts.set(host, Date.now());
    }
    finally {
        release();
        if (this.hostQueues.get(host) === turn)
            this.hostQueues.delete(host);
    } }
    runHttp<T>(url: string, callback: (signal: AbortSignal) => Promise<T>, delayMs = 500, signal?: AbortSignal, skipInitialPacing = false, deadline?: Deadline): Promise<T> { const combined = AbortSignal.any([this.signal, ...(signal ? [signal] : [])]); return this.http.run(async () => { if (!skipInitialPacing)
        await this.pace(url, delayMs, combined, deadline); return callback(AbortSignal.any([combined, AbortSignal.timeout(CRAWL_LIMITS.fetchMs)])); }, combined); }
    runRender<T>(callback: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> { const combined = AbortSignal.any([this.signal, ...(signal ? [signal] : [])]); return this.render.run(() => callback(AbortSignal.any([combined, AbortSignal.timeout(CRAWL_LIMITS.renderMs)])), combined); }
}
