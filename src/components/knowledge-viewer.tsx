"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyProvenance,
  type BusinessEntry,
  type CitationContext,
  type EntryKind,
  type EntryProvenance,
  type KnowledgeBaseExport,
  type Origin,
  type ReviewStatus,
  type Assessment,
} from "@/contracts";
import { api, companyPath, write } from "./api-client";
import { CATEGORY_SPECS, labelOf } from "./business-fields";
import { ValueView } from "./entry-value";
import { EmptyState, Notice, StatusBadge } from "./ui";
import { EntryHistory } from "./entry-history";
import { filterView } from "@/knowledge/filter-view";
type ViewEntry = {
  id: string;
  company_id: string;
  kind: EntryKind;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: ReviewStatus;
  current_revision: number;
};
type Version = { id: string; version_number: number; created_at: string };
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
        company_id: payload.company_id,
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
  initialData,
}: {
  companyId: string;
  initialVersionId?: string;
  initialData?: {
    companyName: string;
    versions: Version[];
    snapshot?: KnowledgeBaseExport;
    draft?: {
      company: { role: string; archived_at: string | null };
      entries: ViewEntry[];
      citationContext?: CitationContext;
    };
  };
}) {
  const [name, setName] = useState(
    initialData?.companyName ?? "Company knowledge",
  );
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [versions, setVersions] = useState<Version[]>(
    initialData?.versions ?? [],
  );
  const [versionId, setVersionId] = useState(initialVersionId ?? "");
  const [entries, setEntries] = useState<ViewEntry[]>(
    initialData?.snapshot
      ? snapshotEntries(initialData.snapshot)
      : (initialData?.draft?.entries ?? []),
  );
  const [citationContext, setCitationContext] = useState<
    CitationContext | undefined
  >(initialData?.snapshot ? undefined : initialData?.draft?.citationContext);
  const [payload, setPayload] = useState<KnowledgeBaseExport | null>(
    initialData?.snapshot ?? null,
  );
  const [mode, setMode] = useState("cards");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [origin, setOrigin] = useState("");
  const [review, setReview] = useState("");
  const [coverage, setCoverage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialData);
  const initializedList = useRef(false);
  const initializedView = useRef(false);
  const [canEdit, setCanEdit] = useState(
    Boolean(
      initialData?.draft &&
      initialData.draft.company.role !== "viewer" &&
      !initialData.draft.company.archived_at,
    ),
  );
  const [history, setHistory] = useState<ViewEntry | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ companies: { id: string; name: string }[] }>("/api/companies")
      .then((data) => setCompanies(data.companies))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (initialData && !initializedList.current) {
      initializedList.current = true;
      return;
    }
    initializedList.current = true;
    setVersionId(initialVersionId ?? "");
    setVersions([]);
    setHistory(null);
    if (!companyId) return;
    const abort = new AbortController();
    api<Version[] | { versions: Version[] }>(
      companyPath(companyId, "/versions"),
      { signal: abort.signal },
    )
      .then((data) => {
        if (abort.signal.aborted) return;
        const all = Array.isArray(data) ? data : data.versions;
        setVersions(all);
        setVersionId(initialVersionId ?? all[0]?.id ?? "draft");
      })
      .catch((error) => {
        if (!abort.signal.aborted) setError(error.message);
      });
    return () => abort.abort();
  }, [companyId, initialVersionId]);
  useEffect(() => {
    setQuery("");
    setSection("");
    setOrigin("");
    setReview("");
    setCoverage("");
  }, [companyId, versionId]);
  useEffect(() => {
    if (initialData && !initializedView.current) {
      initializedView.current = true;
      return;
    }
    initializedView.current = true;
    if (!versionId || !companyId) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setEntries([]);
    setPayload(null);
    setCitationContext(undefined);
    setCanEdit(false);
    const request =
      versionId === "draft"
        ? api<{
            company: { name: string; role: string; archived_at: string | null };
            entries: ViewEntry[];
            citationContext?: CitationContext;
          }>(companyPath(companyId, "/draft"), { signal: abort.signal }).then(
            (data) => {
              if (abort.signal.aborted) return;
              setName(data.company.name);
              setCanEdit(
                data.company.role !== "viewer" && !data.company.archived_at,
              );
              setEntries(data.entries);
              setCitationContext(data.citationContext);
            },
          )
        : api<KnowledgeBaseExport>(
            companyPath(companyId, `/versions/${versionId}`),
            { signal: abort.signal },
          ).then((data) => {
            if (abort.signal.aborted) return;
            setPayload(data);
            setName(data.provenance.company.name);
            setEntries(snapshotEntries(data));
          });
    request
      .catch((error) => {
        if (!abort.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [companyId, versionId, reload]);
  async function reject(entry: ViewEntry) {
    setBusy(true);
    setError("");
    try {
      await api(
        companyPath(companyId, `/entries/${entry.id}/revisions`),
        write("POST", {
          expectedRevision: entry.current_revision,
          content: entry.content,
          provenance: entry.provenance,
          reviewStatus: "rejected",
          reason: "Reviewer removed this entry from future snapshots.",
          requestId: crypto.randomUUID(),
        }),
      );
      setReload((value) => value + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function draftActions(entry: ViewEntry) {
    return versionId === "draft" ? (
      <div className="actions">
        <Link
          className="button button--quiet"
          href={`/knowledge?companyId=${companyId}&category=${entry.kind}&entryId=${entry.id}`}
        >
          {canEdit ? "Edit draft" : "View draft"}
        </Link>
        <button
          className="button button--quiet"
          onClick={() => setHistory(entry)}
        >
          History
        </button>
        {canEdit && (
          <button
            className="button button--quiet button--danger"
            disabled={busy}
            onClick={() => reject(entry)}
          >
            Remove from future versions
          </button>
        )}
      </div>
    ) : null;
  }
  const filtered = useMemo(
    () =>
      filterView(
        entries.map((entry) => {
          const root =
            entry.kind === "key_person"
              ? `/key_people/@${(entry.content as { id: string }).id}`
              : entry.kind === "offering"
                ? `/offerings/@${(entry.content as { id: string }).id}`
                : `/${entry.kind}`;
          return {
            ...entry,
            entry_id: entry.id,
            provenance: {
              ...entry.provenance,
              claims: entry.provenance.claims.filter(
                (claim) => claim.entry_id === entry.id,
              ),
              coverage: entry.provenance.coverage.filter((item) =>
                item.targets.some(
                  (target) => target === root || target.startsWith(`${root}/`),
                ),
              ),
            },
          };
        }),
        {
          companyId,
          query,
          section: (section || undefined) as EntryKind | undefined,
          origin: (origin || undefined) as Origin | undefined,
          reviewStatus: (review || undefined) as ReviewStatus | undefined,
          coverage: (coverage || undefined) as Assessment | undefined,
        },
      ).map((entry) => ({
        ...entry,
        provenance: entries.find((original) => original.id === entry.id)!
          .provenance,
      })),
    [companyId, entries, section, review, origin, coverage, query],
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
          <div className="actions">
            <select
              className="company-switcher"
              aria-label="Switch company"
              value={companyId}
              onChange={(event) =>
                window.location.assign(
                  `/knowledge/view?companyId=${event.target.value}`,
                )
              }
            >
              {!companies.some((company) => company.id === companyId) && (
                <option value={companyId}>{name}</option>
              )}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
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
          </div>
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
        {error && (
          <Notice error>
            {error}
            {canEdit && versionId === "draft" && (
              <button
                className="button"
                onClick={() => setReload((value) => value + 1)}
              >
                Reload latest draft
              </button>
            )}
          </Notice>
        )}
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
                    {draftActions(e)}
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
                              citationContext={citationContext}
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
                      citationContext={citationContext}
                      approved={e.review_status === "approved"}
                    />
                  )}
                  {draftActions(e)}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {history && (
        <EntryHistory
          companyId={companyId}
          kind={history.kind}
          entryId={history.id}
          revision={history.current_revision}
          canEdit={canEdit && versionId === "draft"}
          onClose={() => setHistory(null)}
          onRestore={() => setReload((value) => value + 1)}
          onStale={() => {
            setHistory(null);
            setError(
              "This entry changed before it could be restored. Reload the latest draft, then reopen history to compare before trying again.",
            );
          }}
        />
      )}
    </div>
  );
}
