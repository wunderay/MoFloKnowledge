/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use */
import "server-only";
import type { verifiedSession } from "../lib/supabase/server";
import { FrontierSnapshotSchema, ProgressSchema, SafeJobErrorSchema, JobStatusSchema } from "../contracts/jobs";
import { SourceCoverageSchema, SourceCaptureSchema, type SourceCoverage } from "../contracts/source-coverage";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { HttpError, parseResponse } from "./http";

type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];
interface SourceRow {
  id: string; scrape_job_id: string; normalized_url: string; final_url: string | null;
  title: string | null; retrieved_at: string | null;
  capture_status: "captured" | "failed" | "blocked" | "unsupported"; error_code: string | null;
}
interface JobRow {
  id: string; status: string; created_at: string; updated_at: string;
  options: Record<string, unknown>; progress: Record<string, unknown>;
  checkpoint: Record<string, unknown>; errors: unknown;
}
const terminal = new Set(["succeeded", "partial", "failed", "cancelled"]);

/** Read-only projection: checkpoint candidates, leases and configuration never leave the server. */
export function projectSourceCoverage(job: JobRow | null, sources: SourceRow[]): SourceCoverage {
  if (!job) {
    return { job: null, pages: [] };
  }
  const frontier = FrontierSnapshotSchema.safeParse(job.checkpoint.frontier);
  const errors = parseResponse(SafeJobErrorSchema.array().max(200), job.errors ?? []);
  const status = parseResponse(JobStatusSchema, job.status);
  const progress = parseResponse(ProgressSchema, {
    discovered: 0, selected: 0, captured: 0, failed: 0, blocked: 0, extracted: 0,
    document_limit: job.options.max_pages ?? 10, limits_reached: [], ...job.progress, stage: status,
  });
  const limitsReached = [...new Set([...progress.limits_reached, ...(frontier.success ? frontier.data.limitsReached : [])])];
  const aliases = new Map(frontier.success ? frontier.data.aliases : []);
  const resolve = (input: string) => {
    const visited = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
    while (aliases.has(input) && !visited.has(input)) { visited.add(input); input = aliases.get(input)!; }
    return input;
  };
  const pages = new Map<string, SourceCoverage["pages"][number]>();
  for (const source of sources) {
    const url = source.final_url ?? source.normalized_url;
    const sourceErrors = errors.filter((error) => error.url && [source.normalized_url, url].includes(resolve(error.url)));
    pages.set(resolve(url), {
      sourceId: source.id, url, title: source.title, state: source.capture_status, selected: true,
      retrievedAt: source.retrieved_at,
      reason: sourceErrors.length ? [...new Set(sourceErrors.map((error) => error.message))].join(" ") : source.error_code,
      score: null, depth: null,
    });
  }
  for (const error of errors) {
    if (!error.url || !["capture_failed", "deadline_exceeded", "robots_blocked"].includes(error.code)) {
      continue;
    }
    const url = resolve(error.url);
    if (pages.has(url)) {
      continue;
    }
    pages.set(url, { sourceId: null, url, title: null,
      state: error.code === "robots_blocked" ? "blocked" : "failed", selected: true,
      retrievedAt: null, reason: error.message, score: null, depth: null });
  }
  if (frontier.success) {
    for (const pending of [...frontier.data.pending].sort((a, b) => a.depth - b.depth || b.score - a.score || a.url.localeCompare(b.url))) {
      const url = resolve(pending.url);
      if (pages.has(url)) {
        continue;
      }
      pages.set(url, { sourceId: null, url, title: null,
        state: terminal.has(status) ? "linked_not_selected" : "pending",
        selected: terminal.has(status) ? false : null, retrievedAt: null,
        reason: terminal.has(status) ? "Discovered in this crawl but not captured before it ended." : "Awaiting capture; a running crawl may still process this URL.",
        score: pending.score, depth: pending.depth });
    }
    for (const seen of frontier.data.seen) {
      const url = resolve(seen);
      if (pages.has(url)) {
        continue;
      }
      pages.set(url, { sourceId: null, url, title: null, state: "selected_no_capture", selected: true,
        retrievedAt: null, reason: "Selected URL has no stored capture outcome.", score: null, depth: null });
    }
  }
  return parseResponse(SourceCoverageSchema, { job: {
    id: job.id, status, createdAt: job.created_at, updatedAt: job.updated_at,
    documentLimit: progress.document_limit, progress, limitsReached, errors,
  }, pages: [...pages.values()] });
}

export async function readSourceCoverage(client: Client, companyId: string, userId: string) {
  await authorizeCompany(client, companyId, userId);
  const job = await checked(client.from("scrape_jobs")
    .select("id,status,created_at,updated_at,options,progress,checkpoint,errors")
    .eq("company_id", companyId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle());
  if (!job) {
    return projectSourceCoverage(null, []);
  }
  const sources = await checked(client.from("source_pages")
    .select("id,scrape_job_id,normalized_url,final_url,title,retrieved_at,capture_status,error_code")
    .eq("company_id", companyId).eq("scrape_job_id", job.id).order("recorded_at").order("id"));
  return projectSourceCoverage(job as JobRow, (sources ?? []) as SourceRow[]);
}

export async function readSourceCapture(client: Client, companyId: string, sourceId: string, userId: string) {
  await authorizeCompany(client, companyId, userId);
  const source = await checked(client.from("source_pages")
    .select("id,scrape_job_id,normalized_url,final_url,title,retrieved_at,capture_status,cleaned_content,observations")
    .eq("company_id", companyId).eq("id", sourceId).maybeSingle());
  if (!source) {
    throw new HttpError(404, "unavailable", "Resource unavailable.");
  }
  const observations = source.observations ?? {};
  const segments = Array.isArray(observations.segments) ? observations.segments.flatMap((segment: { id?: unknown; text?: unknown; heading?: unknown }) =>
    typeof segment.id === "string" && typeof segment.text === "string" ? [{ id: segment.id, text: segment.text,
      ...(typeof segment.heading === "string" ? { heading: segment.heading } : {}) }] : []) : [];
  const limitations = Array.isArray(observations.limitations) ? observations.limitations.filter((value: unknown): value is string => typeof value === "string") : [];
  return parseResponse(SourceCaptureSchema, {
    id: source.id, jobId: source.scrape_job_id, url: source.final_url ?? source.normalized_url,
    title: source.title, capturedAt: source.retrieved_at, captureStatus: source.capture_status,
    text: source.cleaned_content ?? "", segments, truncated: observations.truncated === true, limitations,
  });
}
