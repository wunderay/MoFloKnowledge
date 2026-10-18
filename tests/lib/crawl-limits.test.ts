import { afterEach, expect, it, vi } from "vitest";
import { CrawlBudgets } from "../../src/worker/crawl/budgets";

type Limits = Record<string, number>;
type Reader = (env: Record<string, string | undefined>) => Limits;

async function reader(): Promise<Reader> {
  const mod: Record<string, unknown> = await import("../../src/lib/config/crawl-limits" as string).catch(() => ({}));
  return (typeof mod.readCrawlLimits === "function" ? mod.readCrawlLimits : () => ({})) as Reader;
}

afterEach(() => vi.unstubAllEnvs());

it("keeps today's limits when no setting is given", async () => {
  const limits = (await reader())({});
  expect(limits).toMatchObject({
    maxPages: 25,
    defaultPages: 10,
    maxDepth: 3,
    defaultDepth: 2,
    maxDiscovered: 200,
    fetchMs: 15000,
    renderMs: 25000,
    timeBudgetMs: 300000,
    maxHtmlBytes: 2 * 1024 * 1024,
    maxDesignBytes: 15 * 1024 * 1024,
    hostGapMs: 500,
    httpConcurrency: 3,
    renderConcurrency: 1,
    jobTimeoutMs: 600000,
  });
});

it("lets an environment setting change a limit", async () => {
  const limits = (await reader())({ CRAWL_MAX_PAGES: "40", CRAWL_HOST_GAP_MS: "0" });
  expect(limits.maxPages).toBe(40);
  expect(limits.hostGapMs).toBe(0);
  expect(limits.maxDepth).toBe(3);
});

it("lets 'none' remove a limit, including in the page budget", async () => {
  const limits = (await reader())({ CRAWL_MAX_PAGES: "NONE" });
  expect(limits.maxPages).toBe(Number.POSITIVE_INFINITY);
  vi.stubEnv("CRAWL_MAX_PAGES", "none");
  expect(new CrawlBudgets({ documentLimit: 100 }).documentLimit).toBe(100);
});
