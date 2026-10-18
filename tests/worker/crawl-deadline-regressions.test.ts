import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
import {
  accelerateLimits,
  htmlPage,
  makeJob,
  makeRepository,
} from "../helpers/crawl-deadline-site";

// Regressions for the crawl deadline (fake clock, in-memory fetcher).

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
  return {
    ...actual,
    setTimeout: sleep,
    default: { ...actual, setTimeout: sleep },
  };
});

let restore: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(
      () =>
        controller.abort(
          new DOMException("The operation timed out", "TimeoutError"),
        ),
      ms,
    );
    return controller.signal;
  });
});
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.useRealTimers();
});

const response = (url: string, body: string, robots: boolean) => ({
  requestedUrl: url,
  finalUrl: url,
  status: 200,
  headers: { "content-type": robots ? "text/plain" : "text/html" },
  body: Buffer.from(body),
  redirects: [],
});

const hangUntilAbort = (signal?: AbortSignal) =>
  new Promise<never>((_resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason);
    }
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });

interface Behaviour {
  robots: string;
  page?: (path: string, requestNumber: number) => Promise<string> | string;
}

function fetcherFor(
  behaviour: Behaviour,
  pageRequests: string[],
): typeof fetchDocument {
  const counts = new Map<string, number>();
  return async (input, options = {}) => {
    options.signal?.throwIfAborted();
    await options.onRequest?.(input);
    options.signal?.throwIfAborted();
    const url = new URL(input);
    if (url.pathname === "/robots.txt") {
      return response(input, behaviour.robots, true);
    }
    pageRequests.push(url.pathname);
    const number = (counts.get(url.pathname) ?? 0) + 1;
    counts.set(url.pathname, number);
    const body = behaviour.page
      ? await behaviour.page(url.pathname, number)
      : htmlPage();
    return response(input, body, false);
  };
}

async function crawl(
  behaviour: Behaviour,
  pageRequests: string[],
  advanceMs = 600_000,
) {
  const promise = runCrawl(
    makeJob("http://example.com/"),
    makeRepository(),
    new AbortController().signal,
    undefined,
    fetcherFor(behaviour, pageRequests),
  );
  await vi.advanceTimersByTimeAsync(advanceMs);
  return promise;
}

describe("a Crawl-delay longer than the fetch timeout does not fail the crawl", () => {
  it.each([
    ["120", 60_000],
    ["86400", 60_000],
  ])(
    "Crawl-delay: %s is capped at 60 s and the page is fetched after that gap",
    async (seconds, gapMs) => {
      const pageRequests: string[] = [];
      const started = Date.now();
      const promise = runCrawl(
        makeJob("http://example.com/"),
        makeRepository(),
        new AbortController().signal,
        undefined,
        fetcherFor(
          { robots: `User-agent: *\nCrawl-delay: ${seconds}` },
          pageRequests,
        ),
      );
      await vi.advanceTimersByTimeAsync(gapMs - 1_000);
      expect(pageRequests, "the page was fetched before the capped gap").toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await promise;
      expect(Date.now() - started).toBeGreaterThanOrEqual(gapMs);
      expect(pageRequests).toEqual(["/"]);
      expect(result.captures).toHaveLength(1);
      expect(
        result.errors.filter(
          (e) => e.code === "capture_failed" || e.code === "deadline_exceeded",
        ),
      ).toEqual([]);
    },
  );
});

describe("a deadline expiring between batches marks the job partial", () => {
  it("adds 'time' to limits_reached when the loop exits on the job deadline", async () => {
    restore = accelerateLimits({ jobMs: 2_000, fetchMs: 5_000 });
    const pageRequests: string[] = [];
    const result = await crawl(
      {
        robots: "User-agent: *",
        // The root answers late, after the 2000 ms job deadline has passed.
        page: async (path) => {
          if (path !== "/") {
            return htmlPage();
          }
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          return htmlPage(["/a", "/b"]);
        },
      },
      pageRequests,
      10_000,
    );
    expect(result.captures.map((c) => c.capture.normalizedUrl)).toEqual([
      "http://example.com/",
    ]);
    expect(pageRequests).toEqual(["/"]);
    expect(result.progress.limits_reached).toContain("time");
  });
});

describe("per-fetch timeouts keep their single retry", () => {
  it("retries a page that hangs once and captures the second answer", async () => {
    restore = accelerateLimits({ jobMs: 300_000, fetchMs: 800 });
    const pageRequests: string[] = [];
    const promise = runCrawl(
      makeJob("http://example.com/", 1),
      makeRepository(),
      new AbortController().signal,
      undefined,
      (async (input, options = {}) => {
        const url = new URL(input);
        if (
          url.pathname === "/" &&
          pageRequests.length === 0 &&
          options.onRequest
        ) {
          options.signal?.throwIfAborted();
          await options.onRequest(input);
          pageRequests.push(url.pathname);
          return hangUntilAbort(options.signal);
        }
        return fetcherFor({ robots: "User-agent: *" }, pageRequests)(
          input,
          options,
        );
      }) as typeof fetchDocument,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;
    expect(pageRequests).toEqual(["/", "/"]);
    expect(result.captures).toHaveLength(1);
    expect(
      result.errors.filter(
        (e) => e.code === "capture_failed" || e.code === "deadline_exceeded",
      ),
    ).toEqual([]);
  });
});

describe("moderate Crawl-delay is honoured across a batch of same-host siblings", () => {
  const pages = ["/p1", "/p2", "/p3", "/p4", "/p5", "/p6", "/p7", "/p8", "/p9"];
  const tenPageCrawl = async (seconds: number) => {
    const pageRequests: string[] = [];
    const promise = runCrawl(
      makeJob("http://example.com/", 10),
      makeRepository(),
      new AbortController().signal,
      undefined,
      fetcherFor(
        {
          robots: `User-agent: *\nCrawl-delay: ${seconds}`,
          page: (path) => htmlPage(path === "/" ? pages : []),
        },
        pageRequests,
      ),
    );
    const started = Date.now();
    let settled = false;
    promise.then(
      () => (settled = true),
      () => (settled = true),
    );
    for (let step = 0; step < 400 && !settled; step++) {
      await vi.advanceTimersByTimeAsync(1_000);
    }
    const result = await promise;
    return { result, pageRequests, elapsed: Date.now() - started };
  };

  it.each([10, 14, 15])(
    "Crawl-delay: %i captures all 10 pages within the job deadline",
    async (seconds) => {
      const { result, pageRequests, elapsed } = await tenPageCrawl(seconds);
      expect(result.captures).toHaveLength(10);
      expect(pageRequests).toHaveLength(10);
      expect(
        result.errors.filter(
          (e) => e.code === "capture_failed" || e.code === "deadline_exceeded",
        ),
      ).toEqual([]);
      expect(elapsed).toBeLessThan(300_000);
      expect(result.progress.limits_reached).not.toContain("time");
    },
  );
});

describe("redirect hops under a moderate Crawl-delay", () => {
  const pages = ["/p1", "/p2", "/p3", "/p4", "/p5", "/p6", "/p7", "/p8", "/p9"];
  interface Request { path: string; at: number }

  /** Like the real transport: onRequest runs for every hop, and a hop never starts on an expired signal. */
  function redirectingFetcher(
    seconds: number,
    redirecting: Set<string>,
    requests: Request[],
  ): typeof fetchDocument {
    return async (input, options = {}) => {
      let current = input;
      for (;;) {
        options.signal?.throwIfAborted();
        await options.onRequest?.(current);
        options.signal?.throwIfAborted();
        const url = new URL(current);
        requests.push({ path: url.pathname, at: Date.now() });
        if (url.pathname === "/robots.txt") {
          return response(
            current,
            `User-agent: *\nCrawl-delay: ${seconds}`,
            true,
          );
        }
        if (redirecting.has(url.pathname)) {
          current = new URL(url.pathname + "/", current).href;
          continue;
        }
        return response(
          current,
          htmlPage(url.pathname === "/" ? pages : []),
          false,
        );
      }
    };
  }

  async function crawlSite(seconds: number, redirecting: Set<string>) {
    const requests: Request[] = [];
    const promise = runCrawl(
      makeJob("http://example.com/", 10),
      makeRepository(),
      new AbortController().signal,
      undefined,
      redirectingFetcher(seconds, redirecting, requests),
    );
    const started = Date.now();
    let settled = false;
    promise.then(
      () => (settled = true),
      () => (settled = true),
    );
    for (let step = 0; step < 400 && !settled; step++) {
      await vi.advanceTimersByTimeAsync(1_000);
    }
    const result = await promise;
    const times = requests.map((r) => r.at).sort((a, b) => a - b);
    const gaps = times.slice(1).map((time, index) => time - times[index]);
    return { result, requests, gaps, elapsed: Date.now() - started };
  }

  const expectAllCapturedPolitely = (
    outcome: Awaited<ReturnType<typeof crawlSite>>,
    seconds: number,
  ) => {
    expect(outcome.result.captures).toHaveLength(10);
    expect(
      outcome.result.errors.filter(
        (e) => e.code === "capture_failed" || e.code === "deadline_exceeded",
      ),
    ).toEqual([]);
    expect(
      Math.min(...outcome.gaps),
      "two same-host requests were closer than the Crawl-delay",
    ).toBeGreaterThanOrEqual(seconds * 1000);
    expect(outcome.elapsed).toBeLessThan(300_000);
  };

  it.each([5, 10, 14])(
    "Crawl-delay: %i keeps a redirecting page that is first in its batch",
    async (seconds) => {
      expectAllCapturedPolitely(
        await crawlSite(seconds, new Set(["/p1"])),
        seconds,
      );
    },
  );

  it.each([5, 10, 14])(
    "Crawl-delay: %i keeps a redirecting page that is second in its batch",
    async (seconds) => {
      expectAllCapturedPolitely(
        await crawlSite(seconds, new Set(["/p2"])),
        seconds,
      );
    },
  );

  it.each([4.9, 7])(
    "Crawl-delay: %s keeps a site where every page redirects to a trailing slash",
    async (seconds) => {
      expectAllCapturedPolitely(
        await crawlSite(seconds, new Set(pages)),
        seconds,
      );
    },
  );
});
