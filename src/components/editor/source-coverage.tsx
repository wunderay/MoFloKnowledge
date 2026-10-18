"use client";
import { useState } from "react";
import type { SourceCoverage as CoverageData, SourceCapture } from "@/contracts/source-coverage";
import { api, companyPath } from "../shared/api-client";
import { safeHref } from "../shared/citation-popover";
import { labelOf } from "./business-fields";

const STATE_LABELS: Record<string, string> = {
  captured: "Captured", failed: "Failed", blocked: "Blocked", unsupported: "Unsupported",
  pending: "Pending", linked_not_selected: "Linked · not selected",
  selected_no_capture: "Selected · no capture recorded",
};
function CapturedSource({ companyId, sourceId }: { companyId: string; sourceId: string }) {
  const [source, setSource] = useState<SourceCapture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setSource(await api<SourceCapture>(companyPath(companyId, `/sources/${encodeURIComponent(sourceId)}`)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className="source-coverage__source" onToggle={(event) => {
      if (event.currentTarget.open && !source && !loading && !error) void load();
    }}>
      <summary>Read retained source text</summary>
      {loading && <p role="status">Loading source text…</p>}
      {error && <p role="alert">{error} <button className="button button--quiet" onClick={load}>Retry source</button></p>}
      {source && (
        <div>
          <p className="source-coverage__text-label">
            {source.truncated ? "Retained source text · capture was truncated" : "Full retained source text"}
          </p>
          <p className="source-coverage__hint">This is the text retained by the capture, not the original page HTML. Content outside the capture may be unavailable.</p>
          {source.limitations.length > 0 && (
            <ul className="source-coverage__limitations">{source.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
          )}
          {source.text ? <pre className="source-coverage__text">{source.text}</pre> : <p>No text was retained for this source.</p>}
        </div>
      )}
    </details>
  );
}

export function SourceCoverage({ companyId, viewingSnapshot = false }: {
  companyId: string; viewingSnapshot?: boolean;
}) {
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setCoverage(await api<CoverageData>(companyPath(companyId, "/sources")));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className="source-coverage" onToggle={(event) => {
      if (event.currentTarget.open && !coverage && !loading && !error) void load();
    }}>
      <summary className="source-coverage__summary">Latest crawl · source coverage</summary>
      <div className="source-coverage__body">
        <p className="source-coverage__hint">
          {viewingSnapshot
            ? "This is the company's latest crawl. It is separate from the saved version and its field citations."
            : "This is the company's latest crawl. Field citations show the evidence supporting each draft value."}
          {" "}The inventory covers recorded URLs, not every page on the website.
        </p>
        {loading && <p role="status">Loading crawl coverage…</p>}
        {error && <p role="alert">{error} <button className="button button--quiet" onClick={load}>Retry coverage</button></p>}
        {coverage && (
          <>
            {!coverage.job ? <p>No crawl has been recorded for this company.</p> : (
              <>
                <dl className="source-coverage__facts">
                  <div><dt>Crawl status</dt><dd>{labelOf(coverage.job.status)}</dd></div>
                  <div><dt>Started</dt><dd><time dateTime={coverage.job.createdAt}>{new Date(coverage.job.createdAt).toLocaleString()}</time></dd></div>
                  <div><dt>Document limit</dt><dd>{coverage.job.documentLimit ?? "Not recorded"}</dd></div>
                  <div><dt>Recorded URLs</dt><dd>{coverage.pages.length}</dd></div>
                </dl>
                {coverage.job.limitsReached.length > 0 && <p>Limits reached: {coverage.job.limitsReached.map(labelOf).join(", ")}.</p>}
                {coverage.job.errors.length > 0 && (
                  <details className="source-coverage__diagnostics">
                    <summary>Crawl limitations & errors · {coverage.job.errors.length}</summary>
                    <ul>{coverage.job.errors.map((error, index) => <li key={index}>{error.message}{error.url && <> — {error.url}</>}</li>)}</ul>
                  </details>
                )}
                <ul className="source-coverage__pages">
                  {coverage.pages.map((page, index) => (
                    <li className="source-coverage__page" key={`${page.url}-${index}`}>
                      <div className="source-coverage__page-heading">
                        <a className="source-coverage__link" href={safeHref(page.url)} target="_blank" rel="noopener noreferrer">{page.title || page.url} ↗</a>
                        <span className="source-coverage__state">{STATE_LABELS[page.state] ?? labelOf(page.state)}</span>
                      </div>
                      {page.title && <p className="source-coverage__url">{page.url}</p>}
                      {(page.reason || page.state !== "captured") && <p className="source-coverage__reason">{page.reason ?? "No reason was recorded for this state."}</p>}
                      {page.retrievedAt && <p className="source-coverage__hint">Captured <time dateTime={page.retrievedAt}>{new Date(page.retrievedAt).toLocaleString()}</time></p>}
                      {page.sourceId && <CapturedSource key={page.sourceId} companyId={companyId} sourceId={page.sourceId} />}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button className="button button--quiet" disabled={loading} onClick={load}>Refresh latest crawl</button>
          </>
        )}
      </div>
    </details>
  );
}
