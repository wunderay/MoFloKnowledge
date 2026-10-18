import { expect, it, vi } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { Frontier } from "../../src/worker/crawl/frontier";
import { CheckpointSchema } from "../../src/contracts/jobs";
import { stableId } from "../../src/lib/identity";
import type { Job, JobRepository } from "../../src/worker/job-repository";
import type { fetchDocument } from "../../src/worker/network/pinned-transport";

it("keeps robots-blocked query variants from using up the page limit", async () => {
  const text = "Wunderay writes software and keeps the projects in public repositories. ".repeat(5);
  const tabs = ["repositories", "projects", "packages", "followers", "following", "achievements"];
  const links = [
    ...tabs.map((tab) => `<a href="/wunderay?tab=${tab}">${tab}</a>`),
    ...["a", "b", "c"].map((name) => `<a href="/wunderay?achievement=${name}&tab=achievements">${name}</a>`),
    ...["chattr", "blogRam", "raymondwu"].map((repo) => `<a href="/wunderay/${repo}">${repo}</a>`),
  ].join("");
  const fetcher: typeof fetchDocument = async (url, options) => {
    await options?.onRequest?.(url);
    const path = new URL(url).pathname;
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      headers: { "content-type": path === "/robots.txt" ? "text/plain" : "text/html" },
      body: Buffer.from(
        path === "/robots.txt"
          ? "User-agent: *\nDisallow: /wunderay?tab=\nDisallow: /wunderay?achievement="
          : `<main><p>${text}</p>${path === "/wunderay" ? links : ""}</main>`,
      ),
      redirects: [],
    };
  };
  const repository = {
    checkpoint: vi.fn().mockResolvedValue({}),
    source: vi.fn(async (_j, capture) => ({ ...capture, id: stableId(String(capture.normalized_url)) })),
  } as unknown as JobRepository;
  const job = {
    id: stableId("job"),
    company_id: stableId("company"),
    requested_url: "https://github.com/wunderay",
    options: { max_pages: 10, max_depth: 2 },
    checkpoint: {},
    requested_by: stableId("user"),
    lease_token: stableId("lease"),
    cancel_requested_at: null,
    progress: { stage: "validating", discovered: 0, selected: 0, captured: 0, failed: 0, blocked: 0, extracted: 0, document_limit: 10, limits_reached: [] },
    status: "crawling",
  } as unknown as Job;
  const result = await runCrawl(job, repository, new AbortController().signal, undefined, fetcher);
  const urls = result.captures.map((c) => c.capture.normalizedUrl);
  for (const repo of ["chattr", "blogRam", "raymondwu"]) {
    expect(urls).toContain(`https://github.com/wunderay/${repo}`);
  }
  expect(result.progress.blocked).toBeGreaterThan(0);
});

it("selects funnel pages before legal pages", () => {
  const frontier = new Frontier("https://account-it.net/", { documentLimit: 4 });
  frontier.next();
  for (const [url, label] of [
    ["/firm-background/privacy-policy", "Privacy Policy"],
    ["/blog/tax-tips", "Tax tips"],
    ["/learning-center", "Learning center"],
    ["/services/payroll", "Payroll"],
    ["/services/quickbooks", "QuickBooks"],
    ["/firm-background/referrals", "Referrals"],
    ["/appointment", "Make an Appointment"],
  ]) {
    frontier.add(url, label, 2);
  }
  const selected = [frontier.next(), frontier.next(), frontier.next()].map((item) => new URL(item?.url ?? "").pathname);
  expect(selected.slice(0, 2).sort()).toEqual(["/appointment", "/firm-background/referrals"]);
  expect(selected).not.toContain("/firm-background/privacy-policy");
});

it("saves a checkpoint whose frontier holds a query-variant link", () => {
  const frontier = new Frontier("https://github.com/wunderay");
  frontier.next();
  frontier.add("/wunderay?tab=repositories", "Repositories", 1);
  frontier.add("/wunderay/chattr", "chattr", 1);
  const checkpoint = {
    frontier: frontier.snapshot(),
    budgets: { documents: 1, htmlBytes: 0, designBytes: 0, startedAt: 0, limitsReached: [] },
    captured_source_ids: [],
    errors: [],
  };
  expect(() => CheckpointSchema.parse(checkpoint)).not.toThrow();
  const selected = [frontier.next(), frontier.next()].map((item) => item?.url);
  expect(selected).toEqual(["https://github.com/wunderay/chattr", "https://github.com/wunderay?tab=repositories"]);
});
