import { expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { stableId } from "../../src/lib/identity";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";

it("re-enqueues links of a capture committed after the last checkpoint on resume", async () => {
  const starts: string[] = [];
  const text = "Northstar builds water monitoring equipment for local teams. ".repeat(5);
  const fetcher: typeof fetchDocument = async (url, options) => {
    await options?.onRequest?.(url);
    starts.push(url);
    const path = new URL(url).pathname;
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      headers: { "content-type": path === "/robots.txt" ? "text/plain" : "text/html" },
      body: Buffer.from(
        path === "/robots.txt" ? "User-agent: *\nAllow: /" : `<main><p>${text}</p></main>`,
      ),
      redirects: [],
    };
  };
  const repository = {
    checkpoint: vi.fn().mockResolvedValue({}),
    source: vi.fn(async (_j, capture) => ({
      ...capture,
      id: stableId(String(capture.normalized_url)),
    })),
  } as unknown as JobRepository;
  // The root capture was committed, but the checkpoint predates it: "/" is still
  // pending and its discovered links were never recorded.
  const row = {
    id: stableId("https://example.com/"),
    normalized_url: "https://example.com/",
    final_url: "https://example.com/",
    title: null,
    author: null,
    site_name: null,
    published_on: null,
    retrieved_at: new Date().toISOString(),
    capture_status: "captured",
    cleaned_content: text,
    content_sha256: "x",
    observations: {
      segments: [],
      links: [{ url: "https://example.com/about", label: "About" }],
    },
  };
  const job = {
    id: stableId("job"),
    company_id: stableId("company"),
    requested_url: "https://example.com/",
    options: { max_pages: 5, max_depth: 2 },
    checkpoint: {
      frontier: {
        root: "https://example.com/",
        pending: [{ url: "https://example.com/", depth: 0, score: 0 }],
        seen: ["https://example.com/"],
        aliases: [],
        selected: 0,
        limitsReached: [],
      },
    },
    source_captures: [row],
    requested_by: stableId("user"),
    lease_token: stableId("lease"),
    cancel_requested_at: null,
    progress: {
      stage: "crawling",
      discovered: 1,
      selected: 0,
      captured: 0,
      failed: 0,
      blocked: 0,
      extracted: 0,
      document_limit: 5,
      limits_reached: [],
    },
    status: "crawling",
  } as unknown as Job;
  const result = await runCrawl(job, repository, new AbortController().signal, undefined, fetcher);
  expect(starts).toContain("https://example.com/about");
  expect(result.captures.map((c) => c.capture.normalizedUrl)).toContain(
    "https://example.com/about",
  );
  expect(starts.filter((u) => new URL(u).pathname === "/")).toHaveLength(0);
}, 10000);
