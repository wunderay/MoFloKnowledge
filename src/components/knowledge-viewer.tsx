"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createEmptyProvenance,
  type BusinessEntry,
  type EntryKind,
  type EntryProvenance,
  type KnowledgeBaseExport,
} from "@/contracts";
import { api, companyPath } from "./api-client";
import { CATEGORY_SPECS, labelOf } from "./business-fields";
import { CitationPopover, safeHref } from "./citation-popover";
import { EmptyState, Notice, StatusBadge } from "./ui";
type ViewEntry = {
  id: string;
  kind: EntryKind;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: string;
  current_revision: number;
};
type Version = { id: string; version_number: number; created_at: string };
function ValueView({
  value,
  path,
  provenance,
  approved,
  label,
}: {
  value: unknown;
  path: string;
  provenance: EntryProvenance;
  approved: boolean;
  label?: string;
}) {
  if (Array.isArray(value))
    return (
      <div className="entry-value">
        <div className="entry-value__label">
          {label}
          <CitationPopover
            path={path}
            provenance={provenance}
            approved={approved}
          />
        </div>
        {value.length ? (
          value.map((item, i) => (
            <div
              className="entry-value__children"
              key={
                item && typeof item === "object" && "id" in item
                  ? String(item.id)
                  : i
              }
            >
              <ValueView
                value={item}
                path={`${path}/${item && typeof item === "object" && "id" in item ? `@${item.id}` : i}`}
                provenance={provenance}
                approved={approved}
              />
            </div>
          ))
        ) : (
          <span className="muted">No values recorded</span>
        )}
      </div>
    );
  if (value && typeof value === "object")
    return (
      <div>
        {Object.entries(value)
          .filter(([key]) => key !== "id")
          .map(([key, child]) => (
            <ValueView
              key={key}
              value={child}
              path={`${path}/${key}`}
              provenance={provenance}
              approved={approved}
              label={labelOf(key)}
            />
          ))}
      </div>
    );
  return (
    <div className="entry-value">
      <span className="entry-value__label">
        {label}
        <CitationPopover
          path={path}
          provenance={provenance}
          approved={approved}
        />
      </span>
      <span className="entry-value__text">
        {value === null ? (
          <span className="muted">Unknown</span>
        ) : typeof value === "string" && /^https?:\/\//.test(value) ? (
          <a href={safeHref(value)} target="_blank" rel="noopener noreferrer">
            {value} ↗
          </a>
        ) : typeof value === "boolean" ? (
          value ? (
            "Yes"
          ) : (
            "No"
          )
        ) : (
          String(value)
        )}
      </span>
    </div>
  );
}
function snapshotEntries(payload: KnowledgeBaseExport): ViewEntry[] {
  const provenance = { ...createEmptyProvenance(), ...payload.provenance };
  return Object.keys(CATEGORY_SPECS).flatMap((kind) => {
    const key =
      kind === "key_person"
        ? "key_people"
        : kind === "offering"
          ? "offerings"
          : kind;
    const values =
      kind === "key_person" || kind === "offering"
        ? payload[key as "key_people" | "offerings"]
        : [payload[key as "company_foundation"]];
    return (values as BusinessEntry[]).map((content) => {
      const state = payload.provenance.entries.find(
        (e) =>
          e.kind === kind && (!("id" in content) || e.entry_id === content.id),
      );
      return {
        id: state?.entry_id ?? kind,
        kind: kind as EntryKind,
        content,
        provenance,
        review_status: state?.review_status ?? "rejected",
        current_revision: state?.revision ?? 0,
      };
    });
  });
}
export function KnowledgeViewer({
  companyId,
  initialVersionId,
}: {
  companyId: string;
  initialVersionId?: string;
}) {
  const [name, setName] = useState("Company knowledge");
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState(initialVersionId ?? "");
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [payload, setPayload] = useState<KnowledgeBaseExport | null>(null);
  const [mode, setMode] = useState("cards");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [origin, setOrigin] = useState("");
  const [review, setReview] = useState("");
  const [coverage, setCoverage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    api<Version[] | { versions: Version[] }>(
      companyPath(companyId, "/versions"),
    )
      .then((data) => {
        const all = Array.isArray(data) ? data : data.versions;
        setVersions(all);
        if (!initialVersionId) setVersionId(all[0]?.id ?? "draft");
      })
      .catch((e) => setError(e.message));
  }, [companyId, initialVersionId]);
  useEffect(() => {
    if (!versionId) return;
    setLoading(true);
    setError("");
    if (versionId === "draft")
      api<{ company: { name: string }; entries: ViewEntry[] }>(
        companyPath(companyId, "/draft"),
      )
        .then((data) => {
          setName(data.company.name);
          setEntries(data.entries);
          setPayload(null);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    else
      api<KnowledgeBaseExport>(companyPath(companyId, `/versions/${versionId}`))
        .then((data) => {
          setPayload(data);
          setName(data.provenance.company.name);
          setEntries(snapshotEntries(data));
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, [companyId, versionId]);
  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!section || e.kind === section) &&
          (!review || e.review_status === review) &&
          (!origin || e.provenance.claims.some((c) => c.origin === origin)) &&
          (!coverage ||
            e.provenance.coverage.some((c) => c.status === coverage)) &&
          JSON.stringify(e.content).toLowerCase().includes(query.toLowerCase()),
      ),
    [entries, section, review, origin, coverage, query],
  );
  if (!companyId)
    return (
      <Notice error>
        Select a company from the dashboard.{" "}
        <Link href="/dashboard">View companies</Link>
      </Notice>
    );
  return (
    <div className="version-viewer">
      <div className="breadcrumb">
        <Link href="/dashboard">Companies</Link>
        <span>/</span>
        <Link href={`/knowledge?companyId=${companyId}`}>{name}</Link>
        <span>/</span>
        <span>View knowledge</span>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Knowledge library</p>
          <h1>{name}</h1>
          <p>
            {versionId === "draft"
              ? "Current draft · changes are reviewed before publication."
              : "Saved knowledge · an immutable record of reviewed company facts."}
          </p>
        </div>
        <div className="actions">
          <Link className="button" href={`/knowledge?companyId=${companyId}`}>
            Open current draft
          </Link>
          {payload && (
            <a
              className="button button--primary"
              href={companyPath(companyId, `/versions/${versionId}/download`)}
            >
              Download JSON ↓
            </a>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="section-heading">
          <select
            aria-label="Knowledge version"
            className="company-switcher"
            value={versionId}
            onChange={(e) => {
              setVersionId(e.target.value);
              const url = new URL(window.location.href);
              url.searchParams.set("versionId", e.target.value);
              window.history.replaceState(null, "", url);
            }}
          >
            <option value="draft">Current draft</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Version {v.version_number} ·{" "}
                {new Date(v.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
          <div className="actions" aria-label="Display mode">
            {["cards", "table", "detail", "json"].map((item) => (
              <button
                className={`button${mode === item ? " button--primary" : ""}`}
                key={item}
                onClick={() => setMode(item)}
                aria-pressed={mode === item}
              >
                {labelOf(item)}
              </button>
            ))}
          </div>
        </div>
        {payload && (
          <p className="field__hint">
            Version {payload.version} · saved{" "}
            {new Date(payload.saved_at).toLocaleString()} · read only
          </p>
        )}
        <div className="version-viewer__filters">
          <input
            className="filter-input"
            aria-label="Search company knowledge"
            placeholder="Search this company's knowledge…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="filter-input"
            aria-label="Filter section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">All sections</option>
            {Object.entries(CATEGORY_SPECS).map(([key, spec]) => (
              <option value={key} key={key}>
                {spec.label}
              </option>
            ))}
          </select>
          <select
            className="filter-input"
            aria-label="Filter origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option value="">All origins</option>
            {["source_backed", "inferred", "generated", "user_provided"].map(
              (v) => (
                <option key={v} value={v}>
                  {labelOf(v)}
                </option>
              ),
            )}
          </select>
          <select
            className="filter-input"
            aria-label="Filter review status"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          >
            <option value="">All review states</option>
            {["approved", "unreviewed", "rejected"].map((v) => (
              <option key={v} value={v}>
                {labelOf(v)}
              </option>
            ))}
          </select>
          <select
            className="filter-input"
            aria-label="Filter coverage"
            value={coverage}
            onChange={(e) => setCoverage(e.target.value)}
          >
            <option value="">All coverage</option>
            {["found", "not_found", "not_checked", "partial", "conflict"].map(
              (v) => (
                <option key={v} value={v}>
                  {labelOf(v)}
                </option>
              ),
            )}
          </select>
        </div>
        {error && <Notice error>{error}</Notice>}
        {loading ? (
          <Notice>Loading knowledge…</Notice>
        ) : mode === "json" ? (
          <pre className="version-viewer__json">
            {JSON.stringify(payload ?? entries, null, 2)}
          </pre>
        ) : filtered.length === 0 ? (
          <EmptyState title="No matching knowledge">
            <p>Adjust the filters or review the current draft.</p>
          </EmptyState>
        ) : mode === "table" ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Category</th>
                <th>Review</th>
                <th>Revision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    {"name" in e.content
                      ? String(e.content.name ?? "Unnamed")
                      : CATEGORY_SPECS[e.kind]!.label}
                  </td>
                  <td>{CATEGORY_SPECS[e.kind]!.label}</td>
                  <td>
                    <StatusBadge value={e.review_status} />
                  </td>
                  <td>{e.current_revision}</td>
                  <td>
                    <button
                      className="button button--quiet"
                      onClick={() => {
                        setSection(e.kind);
                        setMode("detail");
                      }}
                    >
                      Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={mode === "cards" ? "company-dashboard__grid" : ""}>
            {filtered.map((e) => {
              const root =
                e.kind === "key_person"
                  ? `/key_people/@${(e.content as { id: string }).id}`
                  : e.kind === "offering"
                    ? `/offerings/@${(e.content as { id: string }).id}`
                    : `/${e.kind}`;
              return (
                <article className="knowledge-editor__group" key={e.id}>
                  <div className="section-heading">
                    <h3>
                      {"name" in e.content
                        ? String(
                            e.content.name ?? CATEGORY_SPECS[e.kind]!.label,
                          )
                        : CATEGORY_SPECS[e.kind]!.label}
                    </h3>
                    <StatusBadge value={e.review_status} />
                  </div>
                  {mode === "cards" ? (
                    <>
                      <div>
                        {Object.entries(e.content)
                          .filter(
                            ([key, value]) => key !== "id" && value !== null,
                          )
                          .slice(0, 3)
                          .map(([key, value]) => (
                            <ValueView
                              key={key}
                              value={value}
                              label={labelOf(key)}
                              path={`${root}/${key}`}
                              provenance={e.provenance}
                              approved={e.review_status === "approved"}
                            />
                          ))}
                      </div>
                      <button
                        className="button button--quiet"
                        onClick={() => {
                          setSection(e.kind);
                          setMode("detail");
                        }}
                      >
                        Explore full details →
                      </button>
                    </>
                  ) : (
                    <ValueView
                      value={e.content}
                      path={root}
                      provenance={e.provenance}
                      approved={e.review_status === "approved"}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
