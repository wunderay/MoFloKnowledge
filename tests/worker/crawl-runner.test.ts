import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { stableId } from "../../src/lib/identity";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";
it("reserves bounded concurrent pages, obeys robots, finalizes once and resumes extraction captures", async () => {
  const starts: string[] = [];
  let active = 0,
    maximum = 0;
  const rows: Record<string, unknown>[] = [];
  const fetcher: typeof fetchDocument = async (url, options) => {
    await options?.onRequest?.(url);
    starts.push(url);
    const path = new URL(url).pathname;
    if (path !== "/" && path !== "/robots.txt") {
      active++;
      maximum = Math.max(maximum, active);
      await delay(1100);
      active--;
    }
    const text =
      "Northstar builds water monitoring equipment for local community teams. ".repeat(
        5,
      );
    const html =
      path === "/"
        ? `<main><p>${text}</p><a href="/about">About</a><a href="/pricing">Pricing</a><a href="/contact">Contact</a><a href="/private">Private</a><a href="https://other.example.com/">External</a></main>`
        : `<main><p>${text}</p></main>`;
    return {
      requestedUrl: url,
      finalUrl: url,
      status:
        path === "/pricing" &&
        starts.filter((item) => new URL(item).pathname === "/pricing")
          .length === 1
          ? 503
          : 200,
      headers: {
        "content-type": path === "/robots.txt" ? "text/plain" : "text/html",
      },
      body: Buffer.from(
        path === "/robots.txt" ? "User-agent: *\nDisallow: /private" : html,
      ),
      redirects: [],
    };
  };
  const repository = {
    checkpoint: vi.fn().mockResolvedValue({}),
    source: vi.fn(async (_j, capture) => {
      const row = { ...capture, id: stableId(String(capture.normalized_url)) };
      rows.push(row);
      return row;
    }),
  } as unknown as JobRepository;
  const job = {
    id: stableId("job"),
    company_id: stableId("company"),
    requested_url: "https://example.com/",
    options: { max_pages: 5, max_depth: 2 },
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
      document_limit: 5,
      limits_reached: [],
    },
    status: "validating",
  } as Job;
  const first = await runCrawl(
    job,
    repository,
    new AbortController().signal,
    undefined,
    fetcher,
  );
  expect(first.captures).toHaveLength(4);
  expect(first.progress.blocked).toBe(1);
  expect(maximum).toBe(3);
  expect(
    starts.filter((url) => new URL(url).pathname === "/pricing"),
  ).toHaveLength(2);
  expect(starts).not.toContain("https://example.com/private");
  expect(starts.some((url) => url.includes("other.example"))).toBe(false);
  for (const row of rows) {
    expect(row.content_sha256).toBe(
      createHash("sha256").update(String(row.cleaned_content)).digest("hex"),
    );
  }
  const count = starts.length;
  const resumed = await runCrawl(
    {
      ...job,
      status: "extracting",
      checkpoint: { ...first.checkpoint, stage: "extracting" },
      source_captures: rows,
    },
    repository,
    new AbortController().signal,
    undefined,
    fetcher,
  );
  expect(starts).toHaveLength(count);
  expect(repository.source).toHaveBeenCalledTimes(4);
  expect(resumed.progress.stage).toBe("extracting");
  expect(resumed.captures.map((p) => p.id).sort()).toEqual(
    first.captures.map((p) => p.id).sort(),
  );
  expect(first.checkpoint).not.toHaveProperty("source_captures");
}, 10000);
