import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CRAWL_LIMITS } from "../../src/worker/crawl/budgets";
import { RobotsCache } from "../../src/worker/crawl/robots";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { crawlLimits } from "../../src/lib/config/crawl-limits";
import type { FetchOptions, FetchResult, fetchDocument } from "../../src/worker/network/pinned-transport";
import { htmlPage, makeJob, makeRepository } from "../helpers/crawl-deadline-site";

// Acceptance tests for Q56 robots-and-delay (fail-first, locked before the build).
// 1. A robots.txt 301 from the apex host to the www host is followed inside the company scope.
// 2. A Crawl-delay longer than the 15 s fetch timeout does not fail the crawl, and the gap is honoured.
// 3. Crawl-delay 30 with a 15-document limit grows the time budget to fit, capped at job timeout minus 60 s.
// Runs on a fake clock, the same way crawl-deadline-pacing.test.ts does: no real waiting.

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

const reply = (
  input: string,
  status: number,
  body = "",
  headers: Record<string, string> = { "content-type": "text/plain" },
): FetchResult => ({
  requestedUrl: input,
  finalUrl: input,
  status,
  headers,
  body: Buffer.from(body),
  redirects: [],
});

interface Seen {
  host: string;
  path: string;
  at: number;
}

/** In-memory stand-in for createPinnedFetcher: same hook and signal order as the real transport. */
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

/** Runs one crawl of https://example.com/ on the fake clock and returns what it fetched and recorded. */
async function crawlSite(options: {
  delay: string;
  maxPages: number;
  links: string[];
  advanceMs: number;
}) {
  const seen: Seen[] = [];
  const started = Date.now();
  const promise = runCrawl(
    makeJob("https://example.com/", options.maxPages),
    makeRepository(),
    new AbortController().signal,
    undefined,
    memoryFetcher(
      { "example.com": `User-agent: *\nCrawl-delay: ${options.delay}` },
      (_host, path) => htmlPage(path === "/" ? options.links : []),
      seen,
    ),
  );
  await vi.advanceTimersByTimeAsync(options.advanceMs);
  const result = await promise;
  const pages = seen
    .filter((item) => item.path !== "/robots.txt")
    .map((item) => ({ path: item.path, at: item.at - started }))
    .sort((a, b) => a.at - b.at);
  return { result, pages };
}

it("robots.txt 301 from the apex host is followed to the www host inside scope, and its rules apply", async () => {
  const requested: string[] = [];
  const robots = new RobotsCache(async (input: string, options?: FetchOptions) => {
    requested.push(input);
    const url = new URL(input);
    if (options?.scope && !options.scope.includes(url.hostname)) {
      throw new Error(`out of scope: ${url.hostname}`);
    }
    if (url.hostname === "example.com" && url.pathname === "/robots.txt") {
      return reply(input, 301, "", { location: "https://www.example.com/robots.txt" });
    }
    if (url.hostname === "www.example.com" && url.pathname === "/robots.txt") {
      return reply(input, 200, "User-agent: *\nDisallow: /private");
    }
    return reply(input, 404);
  });

  const about = await robots.check("https://example.com/about");
  const privateDecision = await robots.check("https://example.com/private/x");

  expect(about.allowed, `/about on example.com after apex robots 301; requested=${JSON.stringify(requested)}`).toBe(true);
  expect(privateDecision.allowed, "/private/x must be disallowed by the www robots.txt").toBe(false);
  expect(about.limitation ?? "none", "apex robots 301 was treated as indeterminate").not.toMatch(/indeterminate/);
});

it("a Crawl-delay longer than the fetch timeout still fetches pages, with the gap between requests honoured", async () => {
  expect(CRAWL_LIMITS.fetchMs, "this fixture assumes the default 15 s fetch timeout").toBe(15_000);

  const { result, pages } = await crawlSite({
    delay: "30",
    maxPages: 5,
    links: ["/a", "/b"],
    advanceMs: 120_000,
  });

  expect(
    result.errors.map((error) => error.code),
    "Crawl-delay 30 with a 15 s fetch timeout failed the crawl",
  ).not.toContain("deadline_exceeded");
  expect(pages.length, `pages fetched with Crawl-delay 30: ${JSON.stringify(pages)}`).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < pages.length; index++) {
    expect(
      pages[index].at - pages[index - 1].at,
      `gap before ${pages[index].path} with Crawl-delay 30`,
    ).toBeGreaterThanOrEqual(30_000);
  }
});

it("with Crawl-delay 30 and 15 documents the time budget grows to fit, and never exceeds the job timeout minus 60 s", async () => {
  const jobTimeoutMs = crawlLimits().jobTimeoutMs;
  const floorMs = 30 * 15 * 1000 + 60_000; // 510 s
  const ceilingMs = jobTimeoutMs - 60_000; // 540 s at the default 600 s job timeout
  const linksToFourteen = Array.from({ length: 14 }, (_, index) => `/p${index + 1}`);

  // A. Crawl-delay 30 needs about 14 x 30 s = 420 s to fetch 15 documents. The budget must cover that.
  const fits = await crawlSite({
    delay: "30",
    maxPages: 15,
    links: linksToFourteen,
    advanceMs: jobTimeoutMs,
  });
  expect(
    fits.result.captures,
    `15 documents with Crawl-delay 30 (budget floor ${floorMs} ms) were not all captured; limits=${JSON.stringify(fits.result.progress.limits_reached)}`,
  ).toHaveLength(15);
  expect(fits.result.progress.limits_reached, "the time budget stopped a crawl that fits in the job timeout").not.toContain("time");

  // B. A hostile Crawl-delay (capped to 60 s) must not make the crawl run past the ceiling.
  const hostile = await crawlSite({
    delay: "86400",
    maxPages: 15,
    links: linksToFourteen,
    advanceMs: jobTimeoutMs,
  });
  expect(hostile.result.captures.length, "hostile Crawl-delay captured no documents").toBeGreaterThanOrEqual(2);
  expect(
    hostile.pages.at(-1)?.at ?? 0,
    `a page was requested after the ceiling ${ceilingMs} ms; pages=${JSON.stringify(hostile.pages)}`,
  ).toBeLessThanOrEqual(ceilingMs);
  expect(hostile.result.progress.limits_reached, "the capped crawl did not end on the time budget").toContain("time");
});
