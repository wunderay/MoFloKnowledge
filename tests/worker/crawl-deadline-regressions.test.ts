import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
import {
  accelerateLimits,
  htmlPage,
  makeJob,
  makeRepository,
} from "../helpers/crawl-deadline-site";

// Review-round regressions for Q12 crawl-deadline (fake clock, in-memory fetcher).

vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  const sleep = (
    ms: number,
    value?: unknown,
    options?: { signal?: AbortSignal },
  ) =>
    new Promise((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) return reject(signal.reason);
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
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });

type Behaviour = {
  robots: string;
  page?: (path: string, requestNumber: number) => Promise<string> | string;
};

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
    if (url.pathname === "/robots.txt")
      return response(input, behaviour.robots, true);
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

describe("unsatisfiable Crawl-delay fails fast with production limits", () => {
  it.each(["86400", "120"])(
    "Crawl-delay: %s makes no page request and records deadline_exceeded",
    async (seconds) => {
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
      // The wait cannot fit the 15 s task deadline, so nothing should need to sleep for it.
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await promise;
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(pageRequests).toEqual([]);
      expect(result.captures).toHaveLength(0);
      expect(result.errors.map((e) => [e.code, e.url])).toEqual([
        ["deadline_exceeded", "http://example.com/"],
      ]);
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
        // The root answers late, after the 800 ms job deadline has passed.
        page: async (path) => {
          if (path !== "/") return htmlPage();
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
    for (let step = 0; step < 400 && !settled; step++)
      await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;
    return { result, pageRequests, elapsed: Date.now() - started };
  };

  it.each([10, 14])(
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

  it("Crawl-delay: 15 leaves no room for a fetch, so no page request is sent", async () => {
    const { result, pageRequests, elapsed } = await tenPageCrawl(15);
    expect(pageRequests).toEqual([]);
    expect(result.captures).toHaveLength(0);
    expect(result.errors.map((e) => e.code)).toEqual(["deadline_exceeded"]);
    expect(elapsed).toBeLessThan(5_000);
  });
});
