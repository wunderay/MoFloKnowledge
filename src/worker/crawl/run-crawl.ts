import { setTimeout as delay } from "node:timers/promises";
import { NetworkPolicyError, sameSite } from "../network/url-scope";
import { createHash } from "node:crypto";
import { Frontier, type FrontierSnapshot, type FrontierItem } from "./frontier";
import {
  CrawlBudgets,
  type BudgetSnapshot,
  type Reservation,
  CRAWL_LIMITS,
  effectiveTimeBudgetMs,
} from "./budgets";
import { DeadlineError, Scheduler, type Deadline } from "./scheduler";
import { RobotsCache } from "./robots";
import { crawlLimits } from "../../lib/config/crawl-limits";
import { createLinkPicker } from "../agent/client";
import { fetchDocument, type FetchOptions } from "../network/pinned-transport";
import { technicalObservations } from "../extract/observations";
import {
  captureHtml,
  linkedStylesheetUrls,
  shouldRenderPage,
  type PageCapture,
} from "../capture/html";
import type { RenderResult, RenderTask } from "../../contracts/render-task";
import type { Job, JobRepository } from "../job-repository";
import type { Progress, SafeJobError } from "../../contracts";
const MAX_TIMER_MS = 2 ** 31 - 1;
// Linked stylesheets are read for fonts and colours only; they never count against the document limit.
const MAX_PAGE_SHEETS = 3;
const MAX_CRAWL_SHEETS = 6;
const MAX_SHEET_BYTES = 300 * 1024;
export interface StoredCapture {
  id: string;
  retrievedAt: string;
  capture: PageCapture;
}
export interface CrawlResult {
  captures: StoredCapture[];
  errors: SafeJobError[];
  progress: Progress;
  checkpoint: Record<string, unknown>;
}
export async function runCrawl(
  job: Job,
  repository: JobRepository,
  signal: AbortSignal,
  render?: (task: RenderTask, signal?: AbortSignal) => Promise<RenderResult>,
  fetcher: typeof fetchDocument = fetchDocument,
): Promise<CrawlResult> {
  const saved = job.checkpoint;
  const root = (saved.effectiveRoot as string | undefined) ?? job.requested_url;
  const frontier = new Frontier(
    root,
    {
      documentLimit: job.options.max_pages ?? crawlLimits().defaultPages,
      depthLimit: job.options.max_depth ?? crawlLimits().defaultDepth,
    },
    saved.frontier as FrontierSnapshot | undefined,
  );
  const firstStartedAt =
    job.started_at instanceof Date
      ? job.started_at.getTime()
      : job.started_at
        ? Date.parse(job.started_at)
        : Date.now();
  const budgets = new CrawlBudgets(
    {
      documentLimit: job.options.max_pages ?? crawlLimits().defaultPages,
      depthLimit: job.options.max_depth ?? crawlLimits().defaultDepth,
    },
    (saved.budgets as BudgetSnapshot | undefined) ?? {
      documents: 0,
      htmlBytes: 0,
      designBytes: 0,
      startedAt: firstStartedAt,
      limitsReached: [],
    },
  );
  const scheduler = new Scheduler(signal);
  // Undefined unless the optional crawl agent is enabled; it only orders or narrows the next links.
  const pickLinks = createLinkPicker();
  const crawlStartedAt = Date.now();
  let jobDeadlineAt = crawlStartedAt + CRAWL_LIMITS.jobMs;
  let timedOut = false;
  // Time kept free for the request itself once pacing is done.
  const fetchMargin = () =>
    Math.min(1000, CRAWL_LIMITS.fetchMs / 4, CRAWL_LIMITS.jobMs / 4);
  // Job-level signal (outer cancellation + job deadline) bounds robots loads and their pacing.
  const robots = new RobotsCache(
    fetcher,
    (url) => scheduler.pace(url, crawlLimits().hostGapMs, scheduler.signal),
    scheduler.signal,
  );
  // A deadline outcome: an unsatisfiable pacing wait, or the job deadline aborting this very operation.
  const deadlineHit = (error: unknown) =>
    error instanceof DeadlineError ||
    (scheduler.signal.aborted &&
      (error === scheduler.signal.reason ||
        ["TimeoutError", "AbortError"].includes((error as Error)?.name)));
  const captures: StoredCapture[] = [];
  const errors = (saved.errors as SafeJobError[] | undefined) ?? [];
  const progress: Progress = {
    stage: "crawling",
    discovered: 0,
    selected: 0,
    captured: 0,
    failed: 0,
    blocked: 0,
    extracted: 0,
    document_limit: frontier.documentLimit,
    limits_reached: [],
    ...(job.progress as Partial<Progress>),
  };
  progress.stage = "crawling";
  // Sources already finalized are immutable and reused after a process restart.
  for (const row of job.source_captures ?? []) {
    if (row.capture_status === "captured") {
      const observations = row.observations as Record<string, unknown>;
      const capture: PageCapture = {
        normalizedUrl: String(row.normalized_url),
        finalUrl: String(row.final_url),
        title: row.title as string | null,
        author: row.author as string | null,
        publisher: row.site_name as string | null,
        publishedAt: row.published_on as string | null,
        updatedAt: null,
        segments: observations.segments as PageCapture["segments"],
        text: String(row.cleaned_content),
        contentHash: String(row.content_sha256),
        observations,
        links: (observations.links ?? []) as PageCapture["links"],
        requiresRender: false,
        truncated: Boolean(observations.truncated),
      };
      if (capture) {
        captures.push({
          id: String(row.id),
          retrievedAt: String(row.retrieved_at),
          capture,
        });
      }
    }
  }
  if (job.status === "extracting" || saved.stage === "extracting") {
    return {
      captures,
      errors,
      progress: { ...progress, stage: "extracting" },
      checkpoint: saved,
    };
  }
  let effectiveRoot = root;
  let designUsed = Math.max(
    budgets.snapshot().designBytes,
    (job.source_captures ?? []).reduce(
      (total, row) =>
        total +
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- coerces untyped JSON (observations) that may hold a numeric string
        Number(
          (
            (row.observations as Record<string, unknown>)?.design as
              { resourceBytes?: number } | undefined
          )?.resourceBytes ?? 0,
        ),
      0,
    ),
  );
  const inFlight = new Map<string, FrontierItem>();
  const checkpoint = () => ({
    ...saved,
    effectiveRoot,
    frontier: {
      ...frontier.snapshot(),
      pending: [...inFlight.values(), ...frontier.snapshot().pending],
      selected: Math.max(0, frontier.snapshot().selected - inFlight.size),
    },
    budgets: {
      ...budgets.snapshot(),
      documents: Math.max(0, budgets.snapshot().documents - inFlight.size),
      designBytes: designUsed,
    },
    errors,
    captured_source_ids: captures.map((c) => c.id),
  });
  async function persist() {
    progress.discovered = frontier.snapshot().seen.length;
    progress.selected = frontier.snapshot().selected;
    progress.captured = captures.length;
    progress.limits_reached = [
      ...new Set([
        ...frontier.limitsReached,
        ...budgets.limitsReached,
        ...(timedOut ? ["time"] : []),
        ...(designUsed >= CRAWL_LIMITS.designBytes ? ["design_bytes"] : []),
      ]),
    ];
    await repository.checkpoint(job, checkpoint(), progress);
  }
  // Pages and linked stylesheets share the pinned transport, the robots rules and the per-host pacing.
  const fetchPaced = (url: string, delayMs: number, options: FetchOptions) =>
    scheduler.runHttp(
      url,
      (taskSignal, untimed) => {
        // The first hop was paced by runHttp under the job deadline; only redirect hops pace here.
        // A pacing gap never counts against the fetch timeout, so the transport's own timer is left out.
        let paced = false;
        const hopDeadline: Deadline = {
          at: jobDeadlineAt - fetchMargin(),
          scope: "job",
        };
        return fetcher(url, {
          ...options,
          signal: taskSignal,
          timeoutMs: MAX_TIMER_MS,
          onRequest: async (hop) => {
            const rule = await robots.check(hop, taskSignal);
            if (!rule.allowed) {
              throw new Error("robots_blocked");
            }
            if (!paced) {
              paced = true;
              return;
            }
            await untimed(() =>
              scheduler.pace(
                hop,
                Math.max(crawlLimits().hostGapMs, rule.delayMs),
                taskSignal,
                hopDeadline,
              ),
            );
          },
        });
      },
      delayMs,
      signal,
      false,
      { at: jobDeadlineAt - fetchMargin(), scope: "job" },
    );
  // Same-site stylesheets a page links, at most MAX_PAGE_SHEETS per page and MAX_CRAWL_SHEETS per crawl.
  // Text only; a stylesheet that cannot be read is skipped and never fails the page.
  const claimedSheets = new Set<string>();
  async function fetchStylesheets(page: { body: Buffer; finalUrl: string }) {
    const texts: string[] = [];
    // On a shared platform the page design belongs to the platform, not the profile owner.
    if (frontier.pathPrefix) {
      return texts;
    }
    const wanted = linkedStylesheetUrls(page.body, page.finalUrl)
      .filter((url) => sameSite(url, page.finalUrl) && !claimedSheets.has(url))
      .slice(0, Math.min(MAX_PAGE_SHEETS, Math.max(0, MAX_CRAWL_SHEETS - claimedSheets.size)));
    // Claimed before any await so concurrent pages never fetch the same sheet or exceed the crawl cap.
    for (const url of wanted) {
      claimedSheets.add(url);
    }
    for (const url of wanted) {
      try {
        const policy = await robots.check(url, scheduler.signal);
        if (!policy.allowed) {
          continue;
        }
        const response = await fetchPaced(url, policy.delayMs, {
          scope: [new URL(url).hostname],
          maxBytes: MAX_SHEET_BYTES,
          truncate: true,
        });
        if (response.status >= 200 && response.status < 300) {
          texts.push(response.body.toString("utf8"));
        }
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
      }
    }
    return texts;
  }
  // A long Crawl-delay stretches the time budget (once, from the first robots policy read) so the document limit stays reachable.
  let budgetChecked = false;
  function growTimeBudget(crawlDelayMs: number) {
    if (budgetChecked) {
      return;
    }
    budgetChecked = true;
    // Only a declared Crawl-delay counts, not the plain gap between requests.
    if (crawlDelayMs <= crawlLimits().hostGapMs) {
      return;
    }
    const grown = effectiveTimeBudgetMs(
      CRAWL_LIMITS.jobMs,
      crawlDelayMs,
      frontier.documentLimit,
      crawlLimits().jobTimeoutMs,
    );
    if (grown > CRAWL_LIMITS.jobMs) {
      jobDeadlineAt = crawlStartedAt + grown;
      budgets.timeBudgetMs = grown;
      scheduler.extendDeadline(grown);
    }
  }
  async function processItem(item: FrontierItem, reservation: Reservation) {
    let finished = false;
    try {
      const policy = await robots.check(item.url, scheduler.signal);
      growTimeBudget(policy.delayMs);
      if (!policy.allowed) {
        // A refused page is not a captured page: give its slot back.
        budgets.release(reservation);
        frontier.release();
        finished = true;
        progress.blocked++;
        errors.push({
          code: "robots_blocked",
          url: item.url,
          retryable: false,
          message: policy.limitation ?? "Page is blocked by robots policy.",
        });
        return;
      }
      let document: Awaited<ReturnType<typeof fetchDocument>> | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetchPaced(item.url, policy.delayMs, {
            scope: frontier.scope,
            pathPrefix: frontier.pathPrefix,
          });
          document = response;
          if (response.status !== 429 && response.status < 500) {
            break;
          }
          if (attempt === 0 && response.status === 429) {
            const raw = response.headers["retry-after"];
            const seconds = Number(raw);
            const milliseconds = Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(raw ?? "") - Date.now();
            await delay(
              Math.max(
                0,
                Math.min(
                  5000,
                  Number.isFinite(milliseconds) ? milliseconds : 1000,
                ),
              ),
              undefined,
              { signal: scheduler.signal },
            );
          }
        } catch (error) {
          if (
            signal.aborted ||
            scheduler.signal.aborted ||
            (error instanceof DeadlineError && error.scope === "job") ||
            jobDeadlineAt - Date.now() < CRAWL_LIMITS.fetchMs ||
            error instanceof NetworkPolicyError ||
            attempt === 1
          ) {
            throw error;
          }
        }
      }
      if (!document) {
        throw new Error("capture_unavailable");
      }
      if (document.status === 429 || document.status >= 500) {
        throw new Error("page_temporarily_unavailable");
      }
      if (document.status < 200 || document.status >= 300) {
        throw new Error("page_unavailable");
      }
      if (
        !/text\/html|application\/xhtml\+xml/i.test(
          document.headers["content-type"] ?? "",
        )
      ) {
        throw new Error("unsupported_content");
      }
      const stylesheets = await fetchStylesheets(document);
      let capture = captureHtml({ ...document, stylesheets });
      let designBytes = 0;
      if (shouldRenderPage(capture, item.depth === 0)) {
        if (render) {
          try {
            const rendered = await scheduler.runRender(async (taskSignal) => {
              const usedBefore = designUsed;
              const remaining = Math.min(
                15 * 1024 * 1024,
                Math.max(0, CRAWL_LIMITS.designBytes - designUsed),
              );
              designUsed = CRAWL_LIMITS.designBytes;
              await persist();
              return render(
                {
                  url: document.finalUrl,
                  scope: frontier.scope,
                  pathPrefix: frontier.pathPrefix,
                  // The browser service has its own fixed ceilings (25 s, 15 MiB).
                  timeoutMs: Math.min(25000, CRAWL_LIMITS.renderMs),
                  maxDesignBytes: remaining,
                },
                taskSignal,
              ).then((result) => {
                if (result.resourceBytes > remaining) {
                  throw new Error("design_budget");
                }
                designUsed = usedBefore + result.resourceBytes;
                return result;
              });
            }, signal);
            designBytes = rendered.resourceBytes;
            capture = captureHtml({ ...document, stylesheets }, rendered);
          } catch {
            // A failed remote render may have consumed its full allowance.
            designUsed = CRAWL_LIMITS.designBytes;
            errors.push({
              code: "render_unavailable",
              url: item.url,
              retryable: false,
              message: "Browser observations were unavailable.",
            });
          }
        } else {
          errors.push({
            code: "render_not_configured",
            url: item.url,
            retryable: false,
            message: "Browser observations are not configured.",
          });
        }
      }
      budgets.finish(reservation, document.body.byteLength, 0);
      finished = true;
      frontier.alias(item.url, capture.finalUrl);
      if (item.depth === 0) {
        effectiveRoot =
          new URL(capture.finalUrl).origin +
          (frontier.pathPrefix ? `${frontier.pathPrefix}/` : "");
      }
      const retrievedAt = new Date().toISOString();
      const row = await repository.source(job, {
        normalized_url: capture.normalizedUrl,
        final_url: capture.finalUrl,
        title: capture.title,
        author: capture.author,
        site_name: capture.publisher,
        published_on: capture.publishedAt?.slice(0, 10) ?? null,
        retrieved_at: retrievedAt,
        response_status: document.status,
        capture_status: "captured",
        capture_method: designBytes ? "browser" : "http",
        cleaned_content: capture.text,
        content_sha256: createHash("sha256").update(capture.text).digest("hex"),
        observations: {
          ...capture.observations,
          segments: capture.segments,
          links: capture.links,
          truncated: capture.truncated,
          html_bytes: document.body.byteLength,
        },
        design_evidence: {
          observations: technicalObservations({
            id: "",
            retrievedAt,
            capture,
          }).map(({ id: _id, ...observation }) => observation),
        },
      });
      captures.push({ id: String(row.id), retrievedAt, capture });
      if (pickLinks) {
        const candidates = capture.links.filter((link) => frontier.isNew(link.url));
        const ordered = await pickLinks(item.url, candidates, frontier.remaining, scheduler.signal);
        ordered.forEach((link, rank) => frontier.add(link.url, link.label, item.depth + 1, rank, link.nav));
      } else {
        for (const link of capture.links) {
          frontier.add(link.url, link.label, item.depth + 1, undefined, link.nav);
        }
      }
      if (capture.truncated) {
        errors.push({
          code: "text_truncated",
          url: item.url,
          retryable: false,
          message: "Text exceeded the capture limit.",
        });
      }
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason;
      }
      if (error instanceof NetworkPolicyError) {
        throw error;
      }
      progress.failed++;
      if (error instanceof DeadlineError && error.scope === "job") {
        timedOut = true;
      }
      errors.push(
        deadlineHit(error)
          ? {
              code: "deadline_exceeded",
              url: item.url,
              retryable: false,
              message:
                "The crawl deadline passed (timeout or robots.txt Crawl-delay) before this page could be captured.",
            }
          : {
              code: "capture_failed",
              url: item.url,
              retryable: false,
              message:
                "This page could not be captured within the crawl policy.",
            },
      );
    } finally {
      if (!finished) {
        budgets.finish(reservation, 0, 0);
      }
      inFlight.delete(item.url);
    }
  }
  await persist();
  for (;;) {
    if (scheduler.signal.aborted) {
      timedOut = true;
      break;
    }
    const batch: { item: FrontierItem; reservation: Reservation }[] = [];
    for (let index = 0; index < 3; index++) {
      const item = frontier.next();
      if (!item) {
        break;
      }
      if (
        captures.some(
          (c) =>
            c.capture.normalizedUrl === item.url ||
            c.capture.finalUrl === item.url,
        )
      ) {
        // Committed after the last checkpoint: recover its links on resume.
        const done = captures.find(
          (c) =>
            c.capture.normalizedUrl === item.url ||
            c.capture.finalUrl === item.url,
        );
        for (const link of done?.capture.links ?? []) {
          frontier.add(link.url, link.label, item.depth + 1, undefined, link.nav);
        }
        continue;
      }
      try {
        batch.push({ item, reservation: budgets.reserve(item.depth, 0) });
        inFlight.set(item.url, item);
      } catch {
        break;
      }
    }
    if (!batch.length) {
      break;
    }
    await Promise.all(
      batch.map(({ item, reservation }) => processItem(item, reservation)),
    );
    captures.sort(
      (a, b) =>
        Number(a.capture.normalizedUrl !== job.requested_url) -
          Number(b.capture.normalizedUrl !== job.requested_url) ||
        a.capture.normalizedUrl.localeCompare(b.capture.normalizedUrl),
    );
    await persist();
  }
  signal.throwIfAborted();
  await persist();
  return { captures, errors, progress, checkpoint: checkpoint() };
}
