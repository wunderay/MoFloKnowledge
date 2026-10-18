"use client";
import { ArrowUpRight } from "../shared/icons";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, companyPath, write } from "../shared/api-client";
import { Notice, StatusBadge } from "../shared/ui";
import type { Progress, SafeJobError } from "@/contracts";
interface Job {
  id: string;
  status: string;
  progress: Partial<Progress>;
  errors?: SafeJobError[];
}
/** Configured capture limits; a null maximum means no maximum. */
export interface CaptureLimits {
  maxPages: number | null;
  maxDepth: number | null;
  defaultPages: number;
  defaultDepth: number;
}
const DEFAULT_LIMITS: CaptureLimits = { maxPages: 25, maxDepth: 3, defaultPages: 15, defaultDepth: 2 };
const active = ["queued", "validating", "crawling", "extracting"];
export function ScrapeProgress({
  companyId,
  website,
  canEdit,
  onComplete,
  limits = DEFAULT_LIMITS,
}: {
  companyId: string;
  website: string;
  canEdit: boolean;
  onComplete: () => void;
  limits?: CaptureLimits;
}) {
  const maxPages = limits.maxPages ?? Number.POSITIVE_INFINITY;
  const maxDepth = limits.maxDepth ?? Number.POSITIVE_INFINITY;
  const [url, setUrl] = useState(website);
  const [documentLimit, setDocumentLimit] = useState(limits.defaultPages);
  const [depthLimit, setDepthLimit] = useState(limits.defaultDepth);
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const [jobId, setJobId] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("jobId"),
  );
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!jobId) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    async function poll() {
      try {
        const result = await api<Job>(
          companyPath(companyId, `/scrapes/${jobId}`),
        );
        if (stopped) {
          return;
        }
        setJob(result);
        setError("");
        delay = 2000;
        if (active.includes(result.status)) {
          timer = setTimeout(() => { void poll(); }, delay);
        } else {
          onComplete();
        }
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          delay = Math.min(delay * 2, 30000);
          timer = setTimeout(() => { void poll(); }, delay);
        }
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [companyId, jobId, onComplete]);
  async function start(e: React.SyntheticEvent) {
    e.preventDefault();
    if (
      !Number.isInteger(documentLimit) ||
      documentLimit < 1 ||
      documentLimit > maxPages ||
      !Number.isInteger(depthLimit) ||
      depthLimit < 0 ||
      depthLimit > maxDepth
    ) {
      setError(
        `Choose a document limit from 1${limits.maxPages === null ? "" : ` to ${String(limits.maxPages)}`} and a depth limit from 0${limits.maxDepth === null ? "" : ` to ${String(limits.maxDepth)}`}.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    const key = JSON.stringify([url, documentLimit, depthLimit]);
    if (pendingRequest.current?.key !== key) {
      pendingRequest.current = { key, id: crypto.randomUUID() };
    }
    try {
      const result = await api<{ jobId: string; status: string }>(
        companyPath(companyId, "/scrapes"),
        write("POST", {
          url,
          options: { documentLimit, depthLimit },
          requestId: pendingRequest.current.id,
        }),
      );
      pendingRequest.current = null;
      setJob({ id: result.jobId, status: result.status, progress: {} });
      setJobId(result.jobId);
      const next = new URL(window.location.href);
      next.searchParams.set("jobId", result.jobId);
      window.history.replaceState(null, "", next);
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.details &&
        typeof e.details === "object" &&
        "activeJobId" in e.details &&
        typeof e.details.activeJobId === "string"
      ) {
        setJobId(e.details.activeJobId);
        const next = new URL(window.location.href);
        next.searchParams.set("jobId", e.details.activeJobId);
        window.history.replaceState(null, "", next);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    try {
      await api(
        companyPath(companyId, `/scrapes/${jobId}/cancel`),
        write("POST", {}),
      );
      setError(
        "Cancellation requested. Captured sources will remain available.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="scrape-progress" aria-label="Website capture">
      <form className="scrape-progress__form" onSubmit={start}>
        <label className="field">
          <span className="field__label">Company website</span>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); }}
            required
            disabled={
              !canEdit || busy || (!!job && active.includes(job.status))
            }
          />
        </label>
        <button
          className="button button--primary"
          disabled={!canEdit || busy || (!!job && active.includes(job.status))}
        >
          {busy ? "Starting…" : job ? "Start fresh scrape" : "Start scrape"}{" "}
          <ArrowUpRight />
        </button>
      </form>
      <details style={{ marginTop: 12 }}>
        <summary className="field__hint">Capture limits</summary>
        <div className="field-grid" style={{ marginTop: 15 }}>
          <label className="field">
            <span className="field__label">Document limit</span>
            <input
              type="number"
              min={1}
              max={limits.maxPages ?? undefined}
              value={documentLimit}
              disabled={
                !canEdit || busy || Boolean(job && active.includes(job.status))
              }
              onChange={(event) => { setDocumentLimit(Number(event.target.value)); }}
            />
          </label>
          <label className="field">
            <span className="field__label">Depth limit</span>
            <input
              type="number"
              min={0}
              max={limits.maxDepth ?? undefined}
              value={depthLimit}
              disabled={
                !canEdit || busy || Boolean(job && active.includes(job.status))
              }
              onChange={(event) => { setDepthLimit(Number(event.target.value)); }}
            />
          </label>
        </div>
      </details>
      <p className="field__hint" style={{ margin: "10px 0 0" }}>
        Capture up to {documentLimit} public pages using source extraction rules,
        without AI. Unsupported or missing fields stay unknown. Review and
        complete the results before saving a knowledge version.
      </p>
      {job && (
        <>
          <div className="scrape-progress__stage">
            <span className="scrape-progress__dot" />
            <StatusBadge value={job.status} />
            <span>
              {active.includes(job.status)
                ? "Your progress is saved. You can return to this page."
                : job.status === "partial"
                  ? "Partial results are ready for review."
                  : job.status === "succeeded"
                    ? "Capture complete. Your results are ready for review."
                    : `Capture ${job.status}.`}
            </span>
            {canEdit && active.includes(job.status) && (
              <button
                type="button"
                className="button button--quiet"
                onClick={cancel}
              >
                Cancel
              </button>
            )}
          </div>
          <div className="scrape-progress__counts">
            {Object.entries(job.progress ?? {})
              .filter(([, v]) => typeof v === "number")
              .map(([key, value]) => (
                <span key={key}>
                  <strong>{value}</strong> {key.replaceAll("_", " ")}
                </span>
              ))}
          </div>
          {job.status === "extracting" && (
            <p className="field__hint">
              Extracting: {job.progress.extracted ?? 0} of{" "}
              {job.progress.captured ?? 0} captured pages processed.
            </p>
          )}
          {job.progress.limits_reached?.length ? (
            <Notice>
              Capture limits reached: {job.progress.limits_reached.join(", ")}.
              Coverage may be partial.
            </Notice>
          ) : null}
          {job.errors?.length ? (
            <details>
              <summary className="field__hint">
                {job.errors.length} capture limitations
              </summary>
              {job.errors.map((item, index) => (
                <p className="field__hint" key={index}>
                  {item.url} · {item.message} ({item.code})
                </p>
              ))}
            </details>
          ) : null}
        </>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
