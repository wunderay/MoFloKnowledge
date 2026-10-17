import http from "node:http";
import type { AddressInfo } from "node:net";
import { stableId } from "../../src/lib/identity";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import { createPinnedFetcher } from "../../src/worker/network/pinned-transport";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
import { CRAWL_LIMITS } from "../../src/worker/crawl/budgets";

// Shared fixtures for the Q12 crawl-deadline acceptance tests. Everything is
// offline: the real createPinnedFetcher talks to a loopback server through an
// injected approver, exactly like tests/security/pinned-transport.test.ts.

/** How long after a deadline expires a pending operation may still be running. */
export const SLACK_MS = 250;

export type Hit = { host: string; path: string; at: number };
export type SiteRequest = { host: string; path: string };
export type SiteHandler = (
  request: SiteRequest,
  response: http.ServerResponse,
) => void;
export type Site = {
  port: number;
  hits: Hit[];
  /** Real pinned transport pointed at the loopback server. */
  fetcher: typeof fetchDocument;
  /** Hits for anything other than robots.txt. */
  pageHits: () => Hit[];
  close: () => Promise<void>;
};

export async function startSite(handler: SiteHandler): Promise<Site> {
  const hits: Hit[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = http.createServer((request, response) => {
    const host = (request.headers.host ?? "").split(":")[0]!;
    const path = request.url ?? "/";
    hits.push({ host, path, at: Date.now() });
    handler({ host, path }, response);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const fetcher = createPinnedFetcher(async (input) => {
    const url = new URL(input);
    url.port = String(port);
    return { url, addresses: [{ address: "127.0.0.1", family: 4 }] };
  });
  return {
    port,
    hits,
    fetcher,
    pageHits: () => hits.filter((hit) => !hit.path.startsWith("/robots.txt")),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const BODY =
  "Northstar builds water monitoring equipment for local community teams. ".repeat(
    5,
  );

export function htmlPage(links: string[] = []): string {
  return `<main><p>${BODY}</p>${links
    .map((href) => `<a href="${href}">About ${href}</a>`)
    .join("")}</main>`;
}

export function sendHtml(response: http.ServerResponse, html: string) {
  response.writeHead(200, { "content-type": "text/html" }).end(html);
}

export function sendRobots(response: http.ServerResponse, text: string) {
  response.writeHead(200, { "content-type": "text/plain" }).end(text);
}

export function makeJob(requestedUrl: string, maxPages = 5): Job {
  return {
    id: stableId("job"),
    company_id: stableId("company"),
    requested_url: requestedUrl,
    options: { max_pages: maxPages, max_depth: 2 },
    checkpoint: {},
    requested_by: stableId("user"),
    lease_token: stableId("lease"),
    cancel_requested_at: null,
    progress: {
      stage: "validating",
      discovered: 0,
      selected: 0,
      captured: 0,
      failed: 0,
      blocked: 0,
      extracted: 0,
      document_limit: maxPages,
      limits_reached: [],
    },
    status: "validating",
  } as Job;
}

export function makeRepository(
  rows: Record<string, unknown>[] = [],
): JobRepository {
  const checkpoint = async () => ({});
  const source = async (_job: Job, capture: Record<string, unknown>) => {
    const row = { ...capture, id: stableId(String(capture.normalized_url)) };
    rows.push(row);
    return row;
  };
  return { checkpoint, source } as unknown as JobRepository;
}

type MutableLimits = Record<string, number>;

/**
 * Accelerates the production deadlines (CRAWL_LIMITS.jobMs = scheduler/job
 * deadline, CRAWL_LIMITS.fetchMs = per-HTTP-task deadline) without changing any
 * production code. Returns a restore function.
 */
export function accelerateLimits(limits: {
  jobMs: number;
  fetchMs: number;
}): () => void {
  const target = CRAWL_LIMITS as unknown as MutableLimits;
  const saved = { jobMs: target.jobMs!, fetchMs: target.fetchMs! };
  Object.assign(target, limits);
  return () => Object.assign(target, saved);
}

export const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export type Settled<T> =
  | { state: "resolved"; value: T; elapsedMs: number }
  | { state: "rejected"; reason: unknown; elapsedMs: number }
  | { state: "pending"; elapsedMs: number };

/** Waits for a promise for at most `limitMs`, never throwing. */
export async function settle<T>(
  promise: Promise<T>,
  limitMs: number,
): Promise<Settled<T>> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise<"pending">((resolve) => {
    timer = setTimeout(() => resolve("pending"), limitMs);
  });
  try {
    const outcome = await Promise.race([
      promise.then(
        (value) => ({ state: "resolved" as const, value }),
        (reason: unknown) => ({ state: "rejected" as const, reason }),
      ),
      pending,
    ]);
    const elapsedMs = Date.now() - started;
    return outcome === "pending"
      ? { state: "pending", elapsedMs }
      : { ...outcome, elapsedMs };
  } finally {
    clearTimeout(timer);
  }
}
