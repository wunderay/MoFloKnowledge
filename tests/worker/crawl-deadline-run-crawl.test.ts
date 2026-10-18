import { afterEach, describe, expect, it } from "vitest";
import { runCrawl, type CrawlResult } from "../../src/worker/crawl/run-crawl";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
import {
  SLACK_MS,
  accelerateLimits,
  htmlPage,
  makeJob,
  makeRepository,
  sendHtml,
  sendRobots,
  settle,
  startSite,
  wait,
  type Settled,
  type Site,
  type SiteHandler,
} from "../helpers/crawl-deadline-site";

// Crawl deadline. Acceptance tests: an untrusted
// robots.txt `Crawl-delay` must not hold a worker beyond its deadlines.
// Production deadlines are accelerated through CRAWL_LIMITS (jobMs = scheduler
// deadline, fetchMs = per-HTTP-task deadline); the transport is the real
// createPinnedFetcher against a loopback server (no external network).
//
// Covered here:
//   - deadline expiry aborts pending robots check / robots pacing / onRequest pacing promptly
//   - hostile Crawl-delay cannot push a crawl past its job/item deadline; pages recorded as not fetched
//   - outer cancellation still aborts everything
// See also crawl-deadline-transport.test.ts and crawl-deadline-pacing.test.ts.

const ROOT = "http://example.com/";
const REASON = /deadline|crawl[-_ ]?delay|time[-_ ]?(?:out|limit)|timed out/i;

interface HookRecord {
  url: string;
  startedAt: number;
  endedAt?: number;
  abortedAt?: number;
}

/** Wraps a fetcher and times every onRequest hook against the signal it was given. */
function instrument(
  base: typeof fetchDocument,
  records: HookRecord[],
): typeof fetchDocument {
  return (url, options) => {
    const hook = options?.onRequest;
    const signal = options?.signal;
    return base(url, {
      ...options,
      ...(hook
        ? {
            onRequest: async (target: string) => {
              const record: HookRecord = { url: target, startedAt: Date.now() };
              records.push(record);
              const mark = () => {
                record.abortedAt ??= Date.now();
              };
              if (signal?.aborted) {
                mark();
              } else {
                signal?.addEventListener("abort", mark, { once: true });
              }
              try {
                await hook(target);
              } finally {
                record.endedAt = Date.now();
                signal?.removeEventListener("abort", mark);
              }
            },
          }
        : {}),
    });
  };
}

function expectHooksReleasedPromptly(records: HookRecord[]) {
  const now = Date.now();
  for (const record of records) {
    const label = `onRequest hook for ${record.url}`;
    if (record.endedAt === undefined) {
      expect.fail(
        `${label} is still pending ${now - record.startedAt} ms after it started` +
          (record.abortedAt === undefined
            ? " and its signal never aborted"
            : ` and ${now - record.abortedAt} ms after its signal aborted`),
      );
    }
    if (record.abortedAt !== undefined) {
      expect(
        record.endedAt - record.abortedAt,
        `${label} outlived its aborted signal`,
      ).toBeLessThanOrEqual(SLACK_MS);
    }
  }
}

function describeOutcome(outcome: Settled<CrawlResult>, deadlineMs: number) {
  return (
    `runCrawl is ${outcome.state} after ${outcome.elapsedMs} ms although the ` +
    `${deadlineMs} ms deadline passed and the outer signal was never aborted`
  );
}

const hostileRobots =
  (delay: string, site: (path: string) => string = () => htmlPage(["/a", "/b"])): SiteHandler =>
  (request, response) => {
    if (request.path === "/robots.txt") {
      return sendRobots(response, `User-agent: *\nCrawl-delay: ${delay}`);
    }
    sendHtml(response, site(request.path));
  };

let site: Site | undefined;
let restore: (() => void) | undefined;
let outer: AbortController;
afterEach(async () => {
  outer?.abort("test-cleanup");
  restore?.();
  restore = undefined;
  await site?.close();
  site = undefined;
});

async function run(
  handler: SiteHandler,
  options: {
    jobMs: number;
    fetchMs: number;
    limitMs: number;
    url?: string;
    cancelAfterMs?: number;
    preAbort?: boolean;
  },
) {
  restore = accelerateLimits({ jobMs: options.jobMs, fetchMs: options.fetchMs });
  site = await startSite(handler);
  outer = new AbortController();
  if (options.preAbort) {
    outer.abort("cancelled");
  }
  const records: HookRecord[] = [];
  const rows: Record<string, unknown>[] = [];
  const started = Date.now();
  const promise = runCrawl(
    makeJob(options.url ?? ROOT),
    makeRepository(rows),
    outer.signal,
    undefined,
    instrument(site.fetcher, records),
  );
  if (options.cancelAfterMs !== undefined) {
    setTimeout(() => outer.abort("cancelled"), options.cancelAfterMs);
  }
  const outcome = await settle(promise, options.limitMs);
  await wait(SLACK_MS); // let any stray hook finish or prove it is stuck
  return { outcome, records, rows, started, site: site };
}

function resolved(outcome: Settled<CrawlResult>, deadlineMs: number) {
  expect(outcome.state, describeOutcome(outcome, deadlineMs)).toBe("resolved");
  return (outcome as Extract<Settled<CrawlResult>, { state: "resolved" }>).value;
}

function reasonFor(result: CrawlResult, url: string) {
  return result.errors.filter(
    (error) => error.url === url && REASON.test(`${error.code} ${error.message}`),
  );
}

describe("harness control", () => {
  it("captures a healthy two-page site well inside accelerated deadlines", async () => {
    const { outcome, rows, site } = await run(
      (request, response) =>
        request.path === "/robots.txt"
          ? sendRobots(response, "User-agent: *\nDisallow: /private")
          : sendHtml(response, htmlPage(["/about"])),
      { jobMs: 5000, fetchMs: 5000, limitMs: 4000 },
    );
    const result = resolved(outcome, 5000);
    expect(result.captures).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(result.errors.filter((error) => error.code === "capture_failed")).toEqual([]);
    expect(site.pageHits().map((hit) => hit.path).sort()).toEqual(["/", "/about"]);
  });
});

describe("hostile Crawl-delay vs the job deadline", () => {
  it("Crawl-delay: 86400 settles by the job deadline, records the page as not fetched with a reason and never issues the page request", async () => {
    const jobMs = 400;
    const { outcome, records, site } = await run(hostileRobots("86400"), {
      jobMs,
      fetchMs: 5000,
      limitMs: jobMs + SLACK_MS,
    });
    const result = resolved(outcome, jobMs);
    expect(site.pageHits(), "page request issued despite Crawl-delay beyond the deadline").toEqual([]);
    expect(result.captures).toHaveLength(0);
    expect(
      reasonFor(result, ROOT),
      `no deadline/crawl-delay reason recorded for ${ROOT}; got ${JSON.stringify(result.errors)}`,
    ).not.toHaveLength(0);
    expectHooksReleasedPromptly(records);
  });

  it("the per-request onRequest pacing is released at the task (fetch) deadline, not the job deadline", async () => {
    const fetchMs = 150;
    const { outcome, records, site } = await run(hostileRobots("86400"), {
      jobMs: 5000,
      fetchMs,
      // two attempts of one task deadline each, plus robots and scheduling
      limitMs: 2 * fetchMs + 2 * SLACK_MS + 300,
    });
    const result = resolved(outcome, fetchMs);
    expect(site.pageHits()).toEqual([]);
    expect(reasonFor(result, ROOT)).not.toHaveLength(0);
    expectHooksReleasedPromptly(records);
  });

  it.each(["1000000000", "99999999999999999999"])(
    "absurd finite Crawl-delay %s settles by the job deadline",
    async (delay) => {
      const jobMs = 400;
      const { outcome } = await run(hostileRobots(delay), {
        jobMs,
        fetchMs: 5000,
        limitMs: jobMs + SLACK_MS,
      });
      resolved(outcome, jobMs);
    },
  );
});

describe("deadline expiring during the robots.txt fetch", () => {
  it("a robots.txt that never answers cannot hold the crawl past the job deadline", async () => {
    const jobMs = 400;
    const { outcome, records, site } = await run(
      (request, response) => {
        if (request.path === "/robots.txt") {
          return;
        } // never answers
        sendHtml(response, htmlPage());
      },
      { jobMs, fetchMs: 5000, limitMs: jobMs + SLACK_MS },
    );
    const result = resolved(outcome, jobMs);
    expect(site.pageHits()).toEqual([]);
    expect(result.captures).toHaveLength(0);
    expect(reasonFor(result, ROOT)).not.toHaveLength(0);
    expectHooksReleasedPromptly(records);
  });
});

describe("multiple hosts", () => {
  const WWW_PAGE = "http://www.example.com/team";
  const fixture =
    (wwwRobots: (response: Parameters<SiteHandler>[1]) => void): SiteHandler =>
    (request, response) => {
      if (request.host === "www.example.com") {
        if (request.path === "/robots.txt") {
          return wwwRobots(response);
        }
        return sendHtml(response, htmlPage());
      }
      if (request.path === "/robots.txt") {
        return sendRobots(response, "User-agent: *\nDisallow: /private");
      }
      sendHtml(
        response,
        request.path === "/"
          ? htmlPage(["/about", WWW_PAGE])
          : htmlPage(),
      );
    };

  it("a hostile Crawl-delay on one host does not stop healthy hosts and is recorded for the hostile pages only", async () => {
    // fetchMs must stay above the fixed 500 ms same-host gap or healthy pages cannot be paced.
    const jobMs = 2000;
    const { outcome, rows, records, site } = await run(
      fixture((response) =>
        sendRobots(response, "User-agent: *\nCrawl-delay: 86400"),
      ),
      { jobMs, fetchMs: 1000, limitMs: jobMs + SLACK_MS },
    );
    const result = resolved(outcome, jobMs);
    expect(site.pageHits().filter((hit) => hit.host === "www.example.com")).toEqual([]);
    expect(
      site.pageHits().map((hit) => hit.path).sort(),
      "healthy host pages were not fetched",
    ).toEqual(["/", "/about"]);
    expect(rows).toHaveLength(2);
    expect(result.captures).toHaveLength(2);
    expect(reasonFor(result, WWW_PAGE)).not.toHaveLength(0);
    expect(reasonFor(result, ROOT)).toHaveLength(0);
    expectHooksReleasedPromptly(records);
  });

  it("a robots.txt that hangs on one host is released at the job deadline and the healthy host stays captured", async () => {
    const jobMs = 2000;
    const { outcome, rows, records, site } = await run(
      fixture(() => undefined), // www robots.txt never answers
      { jobMs, fetchMs: 5000, limitMs: jobMs + SLACK_MS },
    );
    const result = resolved(outcome, jobMs);
    expect(site.pageHits().filter((hit) => hit.host === "www.example.com")).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(reasonFor(result, WWW_PAGE)).not.toHaveLength(0);
    expectHooksReleasedPromptly(records);
  });
});

describe("outer cancellation still aborts everything", () => {
  const cancelled = (outcome: Settled<CrawlResult>) => {
    expect(outcome.state, `runCrawl is ${outcome.state} ${outcome.elapsedMs} ms after outer cancellation`).toBe("rejected");
    expect((outcome as Extract<Settled<CrawlResult>, { state: "rejected" }>).reason).toBe("cancelled");
  };

  it("cancelling during a satisfiable Crawl-delay sleep rejects with the cancellation reason and issues no page request", async () => {
    // Crawl-delay 3 fits inside the 5 s deadlines, so the crawl really sleeps
    // (about 3 s before the first page) and the cancel at 100 ms lands in that sleep.
    const { outcome, records, site } = await run(hostileRobots("3"), {
      jobMs: 5000,
      fetchMs: 5000,
      cancelAfterMs: 100,
      limitMs: 100 + SLACK_MS,
    });
    cancelled(outcome);
    expect(site.pageHits()).toEqual([]);
    expectHooksReleasedPromptly(records);
  });

  it("cancelling during a robots.txt fetch rejects with the cancellation reason", async () => {
    const { outcome, records, site } = await run(
      (request, response) => {
        if (request.path === "/robots.txt") {
          return;
        }
        sendHtml(response, htmlPage());
      },
      { jobMs: 5000, fetchMs: 5000, cancelAfterMs: 100, limitMs: 100 + SLACK_MS },
    );
    cancelled(outcome);
    expect(site.pageHits()).toEqual([]);
    expectHooksReleasedPromptly(records);
  });

  it("an already-cancelled job issues no request at all", async () => {
    const { outcome, site } = await run(hostileRobots("2"), {
      jobMs: 5000,
      fetchMs: 5000,
      preAbort: true,
      limitMs: SLACK_MS,
    });
    cancelled(outcome);
    expect(site.hits).toEqual([]);
  });
});
