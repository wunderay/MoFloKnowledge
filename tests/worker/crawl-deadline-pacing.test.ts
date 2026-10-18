import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { Scheduler } from "../../src/worker/crawl/scheduler";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
import { htmlPage, makeJob, makeRepository } from "../helpers/crawl-deadline-site";

// Crawl-deadline non-regression: ordinary robots.txt
// Crawl-delay values are still honoured between same-host requests, and
// unusable values fall back to the 500 ms floor. Runs on a fake clock
// (Date, setTimeout, node:timers/promises sleeps and AbortSignal.timeout are all
// driven by vi.advanceTimersByTimeAsync), so a 2 s Crawl-delay costs no real time.

vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  const sleep = (
    ms: number,
    value?: unknown,
    options?: { signal?: AbortSignal },
  ) =>
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("The operation timed out", "TimeoutError")),
      ms,
    );
    return controller.signal;
  });
});
afterEach(() => vi.useRealTimers());

interface Seen { host: string; path: string; at: number }

/** In-memory stand-in for createPinnedFetcher: same hook/signal order as the real transport. */
function memoryFetcher(
  robots: Record<string, string>,
  pages: (host: string, path: string) => string,
  seen: Seen[],
): typeof fetchDocument {
  return async (input, options = {}) => {
    options.signal?.throwIfAborted();
    await options.onRequest?.(input);
    options.signal?.throwIfAborted();
    const url = new URL(input);
    seen.push({ host: url.hostname, path: url.pathname, at: Date.now() });
    const isRobots = url.pathname === "/robots.txt";
    const body = isRobots ? (robots[url.hostname] ?? "") : pages(url.hostname, url.pathname);
    return {
      requestedUrl: input,
      finalUrl: input,
      status: 200,
      headers: { "content-type": isRobots ? "text/plain" : "text/html" },
      body: Buffer.from(body),
      redirects: [],
    };
  };
}

async function crawlWith(robotsLine: string) {
  const seen: Seen[] = [];
  const started = Date.now();
  const promise = runCrawl(
    makeJob("http://example.com/"),
    makeRepository(),
    new AbortController().signal,
    undefined,
    memoryFetcher(
      { "example.com": `User-agent: *\n${robotsLine}` },
      (_host, path) => htmlPage(path === "/" ? ["/a", "/b"] : []),
      seen,
    ),
  );
  await vi.advanceTimersByTimeAsync(120_000);
  const result = await promise;
  const pageTimes = seen.filter((s) => s.path !== "/robots.txt").map((s) => s.at).sort((a, b) => a - b);
  const robotsAt = seen.find((s) => s.path === "/robots.txt")!.at;
  return { result, seen, pageTimes, robotsAt, started };
}

describe("normal Crawl-delay is honoured between same-host requests", () => {
  it.each([1, 2])("Crawl-delay: %i keeps every same-host page request at least that many seconds apart", async (seconds) => {
    const { result, pageTimes, robotsAt } = await crawlWith(`Crawl-delay: ${seconds}`);
    expect(result.captures).toHaveLength(3);
    expect(pageTimes).toHaveLength(3);
    for (let index = 1; index < pageTimes.length; index++) {
      expect(
        pageTimes[index] - pageTimes[index - 1],
        `gap before page request #${index + 1} with Crawl-delay: ${seconds}`,
      ).toBeGreaterThanOrEqual(seconds * 1000);
    }
    expect(pageTimes[0] - robotsAt).toBeGreaterThanOrEqual(500);
  });

  it.each(["0", "-5", "NaN", "abc", "Infinity", "1e999", "0.2"])(
    "unusable Crawl-delay %j falls back to the 500 ms same-host gap and the crawl completes",
    async (value) => {
      const { result, pageTimes, started } = await crawlWith(`Crawl-delay: ${value}`);
      expect(result.captures).toHaveLength(3);
      for (let index = 1; index < pageTimes.length; index++) {
        expect(pageTimes[index] - pageTimes[index - 1]).toBeGreaterThanOrEqual(500);
      }
      expect(pageTimes.at(-1)! - started, "a harmless Crawl-delay stretched the crawl").toBeLessThan(5_000);
    },
  );

  it("Scheduler.pace spaces same-host starts by the requested gap and does not delay other hosts", async () => {
    const scheduler = new Scheduler();
    const origin = Date.now();
    const marks: Record<string, number> = {};
    const mark = (name: string, url: string, gap: number) =>
      scheduler.pace(url, gap).then(() => {
        marks[name] = Date.now() - origin;
      });
    const all = Promise.all([
      mark("a1", "http://a.example.com/1", 2000),
      mark("a2", "http://a.example.com/2", 2000),
      mark("b1", "http://b.example.com/1", 2000),
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    await all;
    expect(marks.a1).toBe(0);
    expect(marks.b1, "another host waited on a.example.com's gap").toBe(0);
    expect(marks.a2).toBeGreaterThanOrEqual(2000);
    expect(marks.a2).toBeLessThan(2000 + 100);
  });
});
