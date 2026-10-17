import { setTimeout as delay } from "node:timers/promises";
import { NetworkPolicyError } from "../network/url-scope";
import { createHash } from "node:crypto";
import { Frontier, type FrontierSnapshot, type FrontierItem } from "./frontier";
import {
  CrawlBudgets,
  type BudgetSnapshot,
  type Reservation,
  CRAWL_LIMITS,
} from "./budgets";
import { DeadlineError, Scheduler, type Deadline } from "./scheduler";
import { RobotsCache } from "./robots";
import { fetchDocument } from "../network/pinned-transport";
import { technicalObservations } from "../extract/observations";
import {
  captureHtml,
  shouldRenderPage,
  type PageCapture,
} from "../capture/html";
import type { RenderResult, RenderTask } from "../../contracts/render-task";
import type { Job, JobRepository } from "../job-repository";
import type { Progress, SafeJobError } from "../../contracts";
export type StoredCapture = {
  id: string;
  retrievedAt: string;
  capture: PageCapture;
};
export type CrawlResult = {
  captures: StoredCapture[];
  errors: SafeJobError[];
  progress: Progress;
  checkpoint: Record<string, unknown>;
};
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
      documentLimit: job.options.max_pages ?? 10,
      depthLimit: job.options.max_depth ?? 2,
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
      documentLimit: job.options.max_pages ?? 10,
      depthLimit: job.options.max_depth ?? 2,
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
  const jobDeadlineAt = Date.now() + CRAWL_LIMITS.jobMs;
  let timedOut = false;
  // Time kept free for the request itself once pacing is done.
  const fetchMargin = () =>
    Math.min(1000, CRAWL_LIMITS.fetchMs / 4, CRAWL_LIMITS.jobMs / 4);
  // Job-level signal (outer cancellation + job deadline) bounds robots loads and their pacing.
  const robots = new RobotsCache(
    fetcher,
    (url) => scheduler.pace(url, 500, scheduler.signal),
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
  for (const row of job.source_captures ?? [])
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
      if (capture)
        captures.push({
          id: String(row.id),
          retrievedAt: String(row.retrieved_at),
          capture,
        });
    }
  if (job.status === "extracting" || saved.stage === "extracting")
    return {
      captures,
      errors,
      progress: { ...progress, stage: "extracting" },
      checkpoint: saved,
    };
  let effectiveRoot = root;
  let designUsed = Math.max(
    budgets.snapshot().designBytes,
    (job.source_captures ?? []).reduce(
      (total, row) =>
        total +
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
  async function processItem(item: FrontierItem, reservation: Reservation) {
    let finished = false;
    try {
      const policy = await robots.check(item.url, scheduler.signal);
      if (!policy.allowed) {
        progress.blocked++;
        errors.push({
          code: "robots_blocked",
          url: item.url,
          retryable: false,
          message: policy.limitation ?? "Page is blocked by robots policy.",
        });
        return;
      }
      // A Crawl-delay that cannot leave room for a fetch is never waited out.
      if (policy.delayMs + fetchMargin() > CRAWL_LIMITS.fetchMs)
        throw new DeadlineError(
          "Crawl-delay is longer than the time allowed for one fetch",
        );
      let document: Awaited<ReturnType<typeof fetchDocument>> | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await scheduler.runHttp(
            item.url,
            (taskSignal) => {
              // The first hop was paced by runHttp under the job deadline; only redirect hops pace here.
              let paced = false;
              const taskAt = Date.now() + CRAWL_LIMITS.fetchMs;
              const hopDeadline: Deadline =
                jobDeadlineAt <= taskAt
                  ? { at: jobDeadlineAt - fetchMargin(), scope: "job" }
                  : { at: taskAt - fetchMargin(), scope: "task" };
              return fetcher(item.url, {
                scope: frontier.scope,
                signal: taskSignal,
                onRequest: async (url) => {
                  const rule = await robots.check(url, taskSignal);
                  if (!rule.allowed) throw new Error("robots_blocked");
                  if (!paced) {
                    paced = true;
                    return;
                  }
                  await scheduler.pace(
                    url,
                    Math.max(500, rule.delayMs),
                    taskSignal,
                    hopDeadline,
                  );
                },
              });
            },
            policy.delayMs,
            signal,
            false,
            { at: jobDeadlineAt - fetchMargin(), scope: "job" },
          );
          document = response;
          if (response.status !== 429 && response.status < 500) break;
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
          )
            throw error;
        }
      }
      if (!document) throw new Error("capture_unavailable");
      if (document.status === 429 || document.status >= 500)
        throw new Error("page_temporarily_unavailable");
      if (document.status < 200 || document.status >= 300)
        throw new Error("page_unavailable");
      if (
        !/text\/html|application\/xhtml\+xml/i.test(
          document.headers["content-type"] ?? "",
        )
      )
        throw new Error("unsupported_content");
      let capture = captureHtml(document);
      let designBytes = 0;
      if (shouldRenderPage(capture, item.depth === 0)) {
        if (render) {
          try {
            const rendered = await scheduler.runRender(async (taskSignal) => {
              const usedBefore = designUsed;
              const remaining = Math.max(
                0,
                CRAWL_LIMITS.designBytes - designUsed,
              );
              designUsed = CRAWL_LIMITS.designBytes;
              await persist();
              return render(
                {
                  url: document.finalUrl,
                  scope: frontier.scope,
                  timeoutMs: 25000,
                  maxDesignBytes: remaining,
                },
                taskSignal,
              ).then((result) => {
                if (result.resourceBytes > remaining)
                  throw new Error("design_budget");
                designUsed = usedBefore + result.resourceBytes;
                return result;
              });
            }, signal);
            designBytes = rendered.resourceBytes;
            capture = captureHtml(document, rendered);
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
        } else
          errors.push({
            code: "render_not_configured",
            url: item.url,
            retryable: false,
            message: "Browser observations are not configured.",
          });
      }
      budgets.finish(reservation, document.body.byteLength, 0);
      finished = true;
      frontier.alias(item.url, capture.finalUrl);
      if (item.depth === 0) effectiveRoot = new URL(capture.finalUrl).origin;
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
      for (const link of capture.links)
        frontier.add(link.url, link.label, item.depth + 1);
      if (capture.truncated)
        errors.push({
          code: "text_truncated",
          url: item.url,
          retryable: false,
          message: "Text exceeded the capture limit.",
        });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof NetworkPolicyError) throw error;
      progress.failed++;
      if (error instanceof DeadlineError && error.scope === "job")
        timedOut = true;
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
      if (!finished) budgets.finish(reservation, 0, 0);
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
      if (!item) break;
      if (
        captures.some(
          (c) =>
            c.capture.normalizedUrl === item.url ||
            c.capture.finalUrl === item.url,
        )
      )
        continue;
      try {
        batch.push({ item, reservation: budgets.reserve(item.depth, 0) });
        inFlight.set(item.url, item);
      } catch {
        break;
      }
    }
    if (!batch.length) break;
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
