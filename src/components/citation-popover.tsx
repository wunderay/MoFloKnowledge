"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { EntryProvenance } from "@/contracts";
import { formatAPACitations } from "@/knowledge/apa";
export function CitationPopover({
  path,
  provenance,
  approved = false,
}: {
  path: string;
  provenance: EntryProvenance;
  approved?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const claims = provenance.claims.filter((c) =>
    c.targets.some((t) => path === t || path.startsWith(`${t}/`)),
  );
  const coverage = provenance.coverage.find((c) =>
    c.targets.some((t) => path === t || path.startsWith(`${t}/`)),
  );
  const citations = formatAPACitations(provenance.sources);
  const evidenceIds = new Set(claims.flatMap((c) => c.evidence_ids));
  for (const claim of claims)
    for (const based of claim.based_on_claim_ids)
      provenance.claims
        .find((c) => c.id === based)
        ?.evidence_ids.forEach((e) => evidenceIds.add(e));
  const evidence = provenance.evidence.filter((e) => evidenceIds.has(e.id));
  const origins = [...new Set(claims.map((c) => c.origin))];
  const label = origins.includes("user_provided")
    ? "User correction"
    : origins.includes("generated")
      ? `Generated${approved ? " · approved" : ""}`
      : origins.includes("inferred")
        ? "Inferred"
        : evidence.length
          ? "Sources"
          : (coverage?.status.replaceAll("_", " ") ?? "Not checked");
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  function stay() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }
  function leave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (
        !container.current?.matches(":hover") &&
        !container.current?.contains(document.activeElement)
      )
        setOpen(false);
    }, 160);
  }
  return (
    <span
      className="citation-popover"
      ref={container}
      onMouseEnter={stay}
      onMouseLeave={leave}
      onFocus={stay}
      onBlur={leave}
    >
      <button
        type="button"
        className="citation-popover__trigger"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Evidence for ${path.split("/").at(-1)?.replaceAll("_", " ")}`}
        onClick={() => setOpen(true)}
      >
        {label} ⓘ
      </button>
      {open && (
        <span
          role="dialog"
          aria-label="Field evidence"
          id={id}
          className="citation-popover__panel"
        >
          <span className="section-heading">
            <strong>Evidence & provenance</strong>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setOpen(false)}
              aria-label="Close evidence"
            >
              ✕
            </button>
          </span>
          {claims.length === 0 && (
            <span>
              {coverage?.reason ??
                "Could not check this value. No source evidence is recorded."}
            </span>
          )}
          {claims.map((c) => (
            <span key={c.id} style={{ display: "block", marginBottom: 10 }}>
              <strong>
                {c.origin === "user_provided"
                  ? "User-provided correction"
                  : c.origin === "generated"
                    ? `Generated suggestion${approved ? " — approved" : ""}`
                    : c.origin === "inferred"
                      ? "Source-based inference"
                      : "Website evidence"}
              </strong>
              {c.origin === "generated" && (
                <span style={{ display: "block" }}>
                  This wording is a suggestion, not a source quote.
                </span>
              )}
              {c.origin === "user_provided" && (
                <span style={{ display: "block" }}>
                  Author: {c.actor_id}
                  <br />
                  Saved:{" "}
                  {c.authored_at ? (
                    <time>{new Date(c.authored_at).toLocaleString()}</time>
                  ) : (
                    "Unavailable"
                  )}
                  <br />
                  Prior source claims are superseded; they do not support this
                  correction.
                </span>
              )}
              {c.note && <span style={{ display: "block" }}>{c.note}</span>}
            </span>
          ))}
          {evidence.map((e) => {
            const source = provenance.sources.find(
              (s) => s.id === e.source_page_id,
            );
            const apa = source ? citations.get(source.id) : undefined;
            return (
              <span key={e.id} style={{ display: "block" }}>
                {e.kind === "text" ? (
                  <blockquote>{e.excerpt}</blockquote>
                ) : (
                  <blockquote>
                    <strong>Technical observation</strong>
                    <br />
                    {e.technical?.selector} · {e.technical?.property}:{" "}
                    {e.technical?.value}
                    {e.technical?.asset_url && (
                      <>
                        <br />
                        {e.technical.asset_url}
                      </>
                    )}
                  </blockquote>
                )}
                {source && (
                  <>
                    <a
                      href={safeHref(source.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {apa?.citation ?? source.title ?? "View source"} ↗
                    </a>
                    <span
                      className="citation-popover__reference"
                      style={{ display: "block" }}
                    >
                      {apa?.reference}
                      <br />
                      Retrieved {new Date(source.retrieved_at).toLocaleString()}
                    </span>
                  </>
                )}
              </span>
            );
          })}
          {coverage && (
            <span
              className="citation-popover__reference"
              style={{ display: "block" }}
            >
              Coverage: {coverage.status.replaceAll("_", " ")}
              {coverage.reason ? ` — ${coverage.reason}` : ""}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
export function safeHref(value: string) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
