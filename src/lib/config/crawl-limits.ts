// Crawl limits, shared by the web app, the worker and the contracts. Each limit reads one environment
// variable and falls back to the built-in value. `none` removes a limit. The web app and the worker
// must run with the same CRAWL_MAX_* values.
const MIB = 1024 * 1024;
const MAX_TIMER_MS = 2 ** 31 - 1; // the longest delay a timer accepts
type Env = Record<string, string | undefined>;
type Kind = "count" | "bytes" | "ms";
const warned = new Set<string>();

/** Positive integer (or 0 when allowed), `none` for "no limit", otherwise the default. */
function read(env: Env, name: string, fallback: number, kind: Kind, min = 1, removable = true): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  if (removable && raw.toLowerCase() === "none") {
    // Byte and time limits use a very large number so values stay finite where they are stored or passed to timers.
    return kind === "count" ? Number.POSITIVE_INFINITY : kind === "bytes" ? Number.MAX_SAFE_INTEGER : MAX_TIMER_MS;
  }
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isSafeInteger(value) && value >= min) {
    return kind === "ms" ? Math.min(value, MAX_TIMER_MS) : value;
  }
  if (!warned.has(name)) {
    warned.add(name);
    process.stderr.write(JSON.stringify({ level: "warn", msg: `invalid ${name}; using ${fallback}` }) + "\n");
  }
  return fallback;
}

/** @public Also read by the tests through a dynamic import. */
export function readCrawlLimits(env: Env = process.env) {
  return {
    maxPages: read(env, "CRAWL_MAX_PAGES", 25, "count"),
    defaultPages: read(env, "CRAWL_DEFAULT_PAGES", 10, "count", 1, false),
    maxDepth: read(env, "CRAWL_MAX_DEPTH", 3, "count"),
    defaultDepth: read(env, "CRAWL_DEFAULT_DEPTH", 2, "count", 0, false),
    maxDiscovered: read(env, "CRAWL_MAX_DISCOVERED", 200, "count"),
    fetchMs: read(env, "CRAWL_FETCH_TIMEOUT_MS", 15000, "ms"),
    renderMs: read(env, "CRAWL_RENDER_TIMEOUT_MS", 25000, "ms"),
    timeBudgetMs: read(env, "CRAWL_TIME_BUDGET_MS", 300000, "ms"),
    maxHtmlBytes: read(env, "CRAWL_MAX_HTML_BYTES", 2 * MIB, "bytes"),
    maxDesignBytes: read(env, "CRAWL_MAX_DESIGN_BYTES", 15 * MIB, "bytes"),
    hostGapMs: read(env, "CRAWL_HOST_GAP_MS", 500, "ms", 0, false),
    httpConcurrency: read(env, "CRAWL_HTTP_CONCURRENCY", 3, "count", 1, false),
    renderConcurrency: read(env, "CRAWL_RENDER_CONCURRENCY", 1, "count", 1, false),
    jobTimeoutMs: read(env, "WORKER_JOB_TIMEOUT_MS", 600000, "ms"),
  };
}

export type CrawlLimits = ReturnType<typeof readCrawlLimits>;
export const crawlLimits = (): CrawlLimits => readCrawlLimits();
