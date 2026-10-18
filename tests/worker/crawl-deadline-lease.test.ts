import { afterEach, describe, expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { runWorker } from "../../src/worker/run-loop";
import type { Job, JobRepository } from "../../src/worker/job-repository";
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
  type Site,
} from "../helpers/crawl-deadline-site";

// Crawl deadline, lease half: "the worker stops renewing its
// lease for a job whose deadline passed". The production worker wiring is used
// as-is (runWorker + runCrawl, as in src/worker/main.ts minus the database).
// Deadlines run in real, accelerated time (CRAWL_LIMITS.jobMs); only the
// worker's 15 s heartbeat interval is faked so it can be advanced instantly.

let site: Site | undefined;
let restore: (() => void) | undefined;
afterEach(async () => {
  vi.useRealTimers();
  restore?.();
  restore = undefined;
  await site?.close();
  site = undefined;
});

describe("the worker does not keep renewing the lease of a job that is past its deadline", () => {
  it("hostile Crawl-delay: 86400 ends the job at its deadline and no heartbeat renews the lease afterwards", async () => {
    const jobMs = 400;
    restore = accelerateLimits({ jobMs, fetchMs: 5000 });
    site = await startSite((request, response) =>
      request.path === "/robots.txt"
        ? sendRobots(response, "User-agent: *\nCrawl-delay: 86400")
        : sendHtml(response, htmlPage(["/a"])),
    );
    const stop = new AbortController();
    const events: string[] = [];
    const queued = makeJob("http://example.com/");
    const heartbeat = vi.fn(async (job: Job) => job);
    const repository = {
      ...makeRepository(),
      claim: vi.fn().mockResolvedValueOnce(queued).mockResolvedValue(null),
      heartbeat,
      fail: vi.fn().mockResolvedValue(undefined),
    } as unknown as JobRepository;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const running = runWorker(
      repository,
      async (job, signal) => {
        await runCrawl(job, repository, signal, undefined, site!.fetcher);
      },
      {
        workerId: "worker-test",
        signal: stop.signal,
        idleMs: 50,
        onEvent: (event) => {
          events.push(String(event.event));
        },
      },
    );
    try {
      // Real time passes the (accelerated) job deadline plus the allowed slack.
      await wait(jobMs + SLACK_MS + 100);
      // The worker's 15 s heartbeat now fires three times (45 s) in fake time.
      await vi.advanceTimersByTimeAsync(45_000);
      const finishedOrStopped = events.some(
        (event) => event === "job_finished" || event === "job_stopped",
      );
      expect.soft(
        finishedOrStopped,
        `job still running ${jobMs + SLACK_MS + 100} ms after its ${jobMs} ms deadline; events=${JSON.stringify(events)}`,
      ).toBe(true);
      expect.soft(
        heartbeat,
        "lease was renewed for a job whose deadline had already passed",
      ).not.toHaveBeenCalled();
      expect.soft(site.pageHits()).toEqual([]);
    } finally {
      stop.abort("shutdown");
      await settle(running, 1000);
    }
  });
});
