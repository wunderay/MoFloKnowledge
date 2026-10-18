import { afterEach, describe, expect, it } from "vitest";
import {
  SLACK_MS,
  sendHtml,
  settle,
  startSite,
  wait,
  type Site,
} from "../helpers/crawl-deadline-site";

// Q12 crawl-deadline, criterion C2: createPinnedFetcher must check the task's
// abort signal before AND after awaiting onRequest, so an expired signal never
// issues the network request. Real transport, loopback server, no external network.

let site: Site | undefined;
afterEach(async () => {
  await site?.close();
  site = undefined;
});

const start = async () => {
  site = await startSite((_request, response) => sendHtml(response, "<p>ok</p>"));
  return site;
};

describe("C2 createPinnedFetcher honours the task signal around onRequest", () => {
  it("C2 an already-expired signal rejects with its reason without calling onRequest or touching the network", async () => {
    const { fetcher, hits } = await start();
    const reason = new Error("task deadline already passed");
    let hookCalls = 0;
    const outcome = await settle(
      fetcher("http://example.com/page", {
        signal: AbortSignal.abort(reason),
        onRequest: async () => {
          hookCalls++;
          await wait(60); // a pacing sleep that would delay the abort by 60 ms
        },
      }),
      SLACK_MS,
    );
    expect(outcome.state, `fetch is ${outcome.state} after ${outcome.elapsedMs} ms with an expired signal`).toBe("rejected");
    expect((outcome as { reason: unknown }).reason).toBe(reason);
    expect(hookCalls, "onRequest was invoked for a request whose signal had already expired").toBe(0);
    expect(hits).toEqual([]);
  });

  it("C2 an already-expired signal never reaches the network even when onRequest is instantaneous", async () => {
    const { fetcher, hits } = await start();
    await expect(
      fetcher("http://example.com/page", {
        signal: AbortSignal.abort(),
        onRequest: async () => undefined,
      }),
    ).rejects.toBeDefined();
    await wait(50);
    expect(hits).toEqual([]);
  });

  it("C2 a signal that expires while onRequest is pending rejects and never issues the request", async () => {
    const { fetcher, hits } = await start();
    const controller = new AbortController();
    const reason = new Error("deadline");
    const outcome = await settle(
      fetcher("http://example.com/page", {
        signal: controller.signal,
        // The hook ignores its caller's signal: the transport must still not send.
        onRequest: async () => {
          setTimeout(() => controller.abort(reason), 10);
          await wait(50);
        },
      }),
      50 + SLACK_MS,
    );
    expect(outcome.state, `fetch is ${outcome.state} after ${outcome.elapsedMs} ms`).toBe("rejected");
    expect((outcome as { reason: unknown }).reason).toBe(reason);
    await wait(50);
    expect(hits, "the request was issued after the signal expired").toEqual([]);
  });

  it("C2 the transport's own timeoutMs deadline is honoured the same way", async () => {
    const { fetcher, hits } = await start();
    const outcome = await settle(
      fetcher("http://example.com/page", {
        timeoutMs: 10,
        onRequest: async () => wait(50),
      }),
      50 + SLACK_MS,
    );
    expect(outcome.state, `fetch is ${outcome.state} after ${outcome.elapsedMs} ms`).toBe("rejected");
    await wait(50);
    expect(hits).toEqual([]);
  });

  it("C2 an expiry between the redirect hops stops the second hop before its onRequest and request", async () => {
    let calls = 0;
    const controller = new AbortController();
    const seen = await startSite((request, response) => {
      if (request.path === "/first") {
        return void response.writeHead(302, { location: "/second" }).end();
      }
      sendHtml(response, "<p>second</p>");
    });
    site = seen;
    const outcome = await settle(
      seen.fetcher("http://example.com/first", {
        signal: controller.signal,
        onRequest: async () => {
          calls++;
          if (calls === 2) {
            controller.abort(new Error("deadline"));
          }
          if (calls === 2) {
            await wait(30);
          }
        },
      }),
      1000,
    );
    expect(outcome.state).toBe("rejected");
    expect(calls).toBe(2);
    await wait(50);
    expect(seen.hits.map((hit) => hit.path)).toEqual(["/first"]);
  });

  it("C2 a hook that rejects (for example robots_blocked) aborts the fetch before any request", async () => {
    const { fetcher, hits } = await start();
    await expect(
      fetcher("http://example.com/page", {
        onRequest: async () => {
          throw new Error("robots_blocked");
        },
      }),
    ).rejects.toThrow("robots_blocked");
    expect(hits).toEqual([]);
  });

  it("C2 non-regression: a live signal calls onRequest once per hop and issues exactly one request", async () => {
    const { fetcher, hits } = await start();
    const urls: string[] = [];
    const response = await fetcher("http://example.com/page", {
      signal: new AbortController().signal,
      onRequest: async (url) => {
        urls.push(url);
        await wait(20);
      },
    });
    expect(response.status).toBe(200);
    expect(urls).toEqual(["http://example.com/page"]);
    expect(hits.map((hit) => hit.path)).toEqual(["/page"]);
  });
});
