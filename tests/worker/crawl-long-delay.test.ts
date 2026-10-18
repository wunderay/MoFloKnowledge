import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectiveTimeBudgetMs } from "../../src/worker/crawl/budgets";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { runWorker } from "../../src/worker/run-loop";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import { htmlPage, makeJob, makeRepository } from "../helpers/crawl-deadline-site";

// Time budget growth for a long Crawl-delay, and the worker lease while the crawl sleeps between requests.

vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  const sleep = (ms: number, value?: unknown, options?: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) {
        return reject(signal.reason);
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal!.reason);
      };
      const timer = globalThis.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  return { ...actual, setTimeout: sleep, default: { ...actual, setTimeout: sleep } };
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("grows the budget to delay x documents + 60 s, capped at the job timeout minus 60 s, and never below the base", () => {
  expect(effectiveTimeBudgetMs(300_000, 30_000, 15, 600_000)).toBe(510_000);
  expect(effectiveTimeBudgetMs(300_000, 86_400_000, 15, 600_000)).toBe(540_000);
  expect(effectiveTimeBudgetMs(300_000, 60_000, 15, 600_000)).toBe(540_000);
  expect(effectiveTimeBudgetMs(300_000, 500, 15, 600_000)).toBe(300_000);
  expect(effectiveTimeBudgetMs(300_000, 10_000, 30, 200_000)).toBe(300_000);
});

it("keeps renewing the lease while a Crawl-delay holds the crawl between requests", async () => {
  const fetcher: typeof fetchDocument = async (input, options = {}) => {
    options.signal?.throwIfAborted();
    await options.onRequest?.(input);
    options.signal?.throwIfAborted();
    const isRobots = new URL(input).pathname === "/robots.txt";
    return {
      requestedUrl: input,
      finalUrl: input,
      status: 200,
      headers: { "content-type": isRobots ? "text/plain" : "text/html" },
      body: Buffer.from(isRobots ? "User-agent: *\nCrawl-delay: 30" : htmlPage(new URL(input).pathname === "/" ? ["/a"] : [])),
      redirects: [],
    };
  };
  const heartbeat = vi.fn(async (job: Job) => job);
  const fail = vi.fn().mockResolvedValue(undefined);
  const events: string[] = [];
  const stop = new AbortController();
  const queued = makeJob("https://example.com/", 5);
  const repository = {
    ...makeRepository(),
    claim: vi.fn().mockResolvedValueOnce(queued).mockResolvedValue(null),
    heartbeat,
    fail,
  } as unknown as JobRepository;
  const running = runWorker(
    repository,
    async (job, signal) => {
      await runCrawl(job, repository, signal, undefined, fetcher);
    },
    { workerId: "worker-test", signal: stop.signal, idleMs: 50, onEvent: (event) => events.push(String(event.event)) },
  );
  await vi.advanceTimersByTimeAsync(100_000);
  stop.abort("shutdown");
  await running;
  expect(events).toContain("job_finished");
  expect(fail).not.toHaveBeenCalled();
  // Robots, the root and /a are 30 s apart: about 60 s of waiting at one heartbeat per 15 s.
  expect(heartbeat.mock.calls.length).toBeGreaterThanOrEqual(3);
});
