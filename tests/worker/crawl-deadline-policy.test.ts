import { describe, expect, it } from "vitest";
import { RobotsCache, parseRobots } from "../../src/worker/crawl/robots";
import { Scheduler } from "../../src/worker/crawl/scheduler";
import type { FetchOptions } from "../../src/worker/network/pinned-transport";
import { SLACK_MS, settle } from "../helpers/crawl-deadline-site";

// Q12 crawl-deadline: robots.txt parsing of untrusted Crawl-delay values,
// RobotsCache abort behaviour and Scheduler pacing under deadline-bearing
// signals. Pure unit tests with real (short) timers; no network.

const robotsText = (delay: string) => `User-agent: *\nCrawl-delay: ${delay}`;

describe("C3/C5 parseRobots treats untrusted Crawl-delay values safely", () => {
  // DECISION: the Quest does not lock a cap on Crawl-delay. Only invariants that
  // hold with or without a cap are locked: always finite, never below the 500 ms
  // floor, unparsable/zero/negative fall back to the floor, small values exact.
  it.each([
    ["0", 500],
    ["-5", 500],
    ["-0", 500],
    ["NaN", 500],
    ["Infinity", 500],
    ["-Infinity", 500],
    ["1e999", 500],
    ["abc", 500],
    ["", 500],
    ["0.1", 500],
    ["0.5", 500],
  ])("C3 Crawl-delay %j yields the 500 ms floor", (value, expected) => {
    expect(parseRobots(robotsText(value)).delayMs).toBe(expected);
  });

  it.each([
    ["1", 1000],
    ["1.5", 1500],
    ["2", 2000],
    [" 2 ", 2000],
  ])("C5 normal Crawl-delay %j is honoured exactly (%d ms)", (value, expected) => {
    expect(parseRobots(robotsText(value)).delayMs).toBe(expected);
  });

  it.each(["86400", "1000000000", "99999999999999999999", "1e300"])(
    "C3 hostile Crawl-delay %j parses to a finite delay of at least 500 ms",
    (value) => {
      const { delayMs } = parseRobots(robotsText(value));
      expect(Number.isFinite(delayMs)).toBe(true);
      expect(delayMs).toBeGreaterThanOrEqual(500);
    },
  );
});

const hangUntilAbort = (signal?: AbortSignal) =>
  new Promise<never>((_resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

describe("C1 RobotsCache and deadline-bearing signals", () => {
  it("C1 a pending robots check rejects promptly when its own deadline signal expires", async () => {
    const cache = new RobotsCache(async (_url: string, options?: FetchOptions) =>
      hangUntilAbort(options?.signal),
    );
    const outcome = await settle(
      cache.check("https://example.com/a", AbortSignal.timeout(30)),
      30 + SLACK_MS,
    );
    expect(outcome.state, `robots check is ${outcome.state} after ${outcome.elapsedMs} ms`).toBe("rejected");
  });
});

describe("C1/C4 Scheduler pacing under deadline-bearing signals (non-regression for the building blocks)", () => {
  const url = "https://example.com/page";

  it("C1 a Crawl-delay sleep on the scheduler's own deadline aborts promptly", async () => {
    const scheduler = new Scheduler(undefined, 20);
    await scheduler.pace(url, 500); // first request of the host is not delayed
    const outcome = await settle(scheduler.pace(url, 86_400_000), 20 + SLACK_MS);
    expect(outcome.state, `second same-host pace is ${outcome.state} after ${outcome.elapsedMs} ms (scheduler.signal.aborted=${scheduler.signal.aborted})`).toBe("rejected");
  });

  it("C1 a Crawl-delay sleep aborts when the caller's task signal expires", async () => {
    const scheduler = new Scheduler();
    await scheduler.pace(url, 500);
    const outcome = await settle(
      scheduler.pace(url, 86_400_000, AbortSignal.timeout(20)),
      20 + SLACK_MS,
    );
    expect(outcome.state).toBe("rejected");
  });

  it("C1 runHttp hands its callback a signal that aborts with the scheduler deadline", async () => {
    const scheduler = new Scheduler(undefined, 20);
    const outcome = await settle(
      scheduler.runHttp(url, (signal) => hangUntilAbort(signal), 500, undefined, true),
      20 + SLACK_MS,
    );
    expect(outcome.state).toBe("rejected");
  });

  it("C1 an aborted pacing waiter releases the host queue for the next request", async () => {
    const scheduler = new Scheduler();
    await scheduler.pace(url, 500);
    const stuck = scheduler.pace(url, 86_400_000, AbortSignal.timeout(20));
    stuck.catch(() => undefined);
    const next = await settle(scheduler.pace(url, 500), 1000);
    expect(next.state, "the next same-host request stayed blocked behind an aborted waiter").toBe("resolved");
  });

  it("C4 outer cancellation aborts a Crawl-delay sleep on the scheduler", async () => {
    const outer = new AbortController();
    const scheduler = new Scheduler(outer.signal);
    await scheduler.pace(url, 500);
    const pending = scheduler.pace(url, 86_400_000);
    setTimeout(() => outer.abort("cancelled"), 20);
    const outcome = await settle(pending, 20 + SLACK_MS);
    expect(outcome.state, `pace is ${outcome.state} after outer cancellation`).toBe("rejected");
  });
});
