"use client";
import { useEffect, useState } from "react";
import { api, companyPath, write } from "./api-client";
import { Notice, StatusBadge } from "./ui";
type Job = {
  id: string;
  status: string;
  progress: Record<string, number | string>;
  errors?: { code: string; message: string; url?: string }[];
};
const active = ["queued", "validating", "crawling", "extracting"];
export function ScrapeProgress({
  companyId,
  website,
  canEdit,
  onComplete,
}: {
  companyId: string;
  website: string;
  canEdit: boolean;
  onComplete: () => void;
}) {
  const [url, setUrl] = useState(website);
  const [jobId, setJobId] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("jobId"),
  );
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    async function poll() {
      try {
        const result = await api<Job>(
          companyPath(companyId, `/scrapes/${jobId}`),
        );
        if (stopped) return;
        setJob(result);
        setError("");
        delay = 2000;
        if (active.includes(result.status)) timer = setTimeout(poll, delay);
        else onComplete();
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          delay = Math.min(delay * 2, 30000);
          timer = setTimeout(poll, delay);
        }
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [companyId, jobId, onComplete]);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ jobId: string; status: string }>(
        companyPath(companyId, "/scrapes"),
        write("POST", { url, requestId: crypto.randomUUID() }),
      );
      setJob({ id: result.jobId, status: result.status, progress: {} });
      setJobId(result.jobId);
      const next = new URL(window.location.href);
      next.searchParams.set("jobId", result.jobId);
      window.history.replaceState(null, "", next);
    } catch (e) {
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
            onChange={(e) => setUrl(e.target.value)}
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
          <span aria-hidden>↗</span>
        </button>
      </form>
      <p className="field__hint" style={{ margin: "10px 0 0" }}>
        Capture up to 10 public pages. Review the results before saving a
        knowledge version.
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
