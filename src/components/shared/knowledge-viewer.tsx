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
import { timing } from "../knowledge-view/timing";
import { CATEGORY_SPECS, labelOf } from "../editor/business-fields";
import { ValueView } from "../editor/entry-value";
import { SourceCoverage } from "../editor/source-coverage";
import { EmptyState, Notice, StatusBadge } from "./ui";
import { EntryHistory } from "../editor/entry-history";
import { filterView } from "@/knowledge/filter-view";
import { SectionView } from "../knowledge-view/section-view";
import { SectionListbox } from "../knowledge-view/section-listbox";
import { type KnowledgeSectionId } from "../knowledge-view/sections";
import "../knowledge-view/knowledge-view.css";
interface ViewEntry {
  id: string;
  company_id: string;
  kind: EntryKind;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: ReviewStatus;
  current_revision: number;
}
interface Version { id: string; version_number: number; created_at: string }
export function snapshotEntries(payload: KnowledgeBaseExport): ViewEntry[] {
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
  initialSection,
  initialOffering,
  initialPerson,
  initialData,
}: {
  companyId: string;
  initialVersionId?: string;
  initialSection?: KnowledgeSectionId;
  initialOffering?: string;
  initialPerson?: string;
  initialData?: {
    companyName: string;
    versions: Version[];
    snapshot?: KnowledgeBaseExport;
    draft?: {
      actorId?: string;
      draftGeneration?: number;
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
  const [mode, setMode] = useState("profile");
  const [knowledgeSection, setKnowledgeSection] = useState<KnowledgeSectionId>(
    initialSection ?? "general",
  );
  const [offeringId, setOfferingId] = useState(initialOffering ?? "");
  const [personId, setPersonId] = useState(initialPerson ?? "");
  const [exportFormat, setExportFormat] = useState("docx");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [origin, setOrigin] = useState("");
  const [review, setReview] = useState("");
  const [coverage, setCoverage] = useState("");
  const [error, setError] = useState("");
  /** An import was saved but the draft could not be re-read: the view is older than the stored entry. */
  const [staleDraft, setStaleDraft] = useState<string | null>(null);
  /** What the unread save was: a change made in place, or (as before) links and people. */
  const [staleWhat, setStaleWhat] = useState<"links" | "changes">("links");
  const [refreshing, setRefreshing] = useState(false);
  /** Counts draft reads and view loads; a read applies only while it is the latest one. */
  const readEpoch = useRef(0);
  /** The draft read now on its way; a newer read or a navigation aborts it. */
  const activeRead = useRef<AbortController | null>(null);
  const viewNow = useRef({ companyId, versionId });
  viewNow.current = { companyId, versionId };
  const staleWhatNow = useRef(staleWhat);
  staleWhatNow.current = staleWhat;
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
  const [actorId, setActorId] = useState(initialData?.draft?.actorId ?? "");
  /** The draft's generation, which renaming the company must quote; null until a draft has been read. */
  const [generation, setGeneration] = useState<number | null>(initialData?.draft?.draftGeneration ?? null);
  const [history, setHistory] = useState<ViewEntry | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ companies: { id: string; name: string }[] }>("/api/companies")
      .then((data) => { setCompanies(data.companies); })
      .catch(() => undefined);
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
    if (!companyId) {
      return;
    }
    const abort = new AbortController();
    api<Version[] | { versions: Version[] }>(
      companyPath(companyId, "/versions"),
      { signal: abort.signal },
    )
      .then((data) => {
        if (abort.signal.aborted) {
          return;
        }
        const all = Array.isArray(data) ? data : data.versions;
        setVersions(all);
        setVersionId(initialVersionId ?? all[0]?.id ?? "draft");
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setError((error as Error).message);
        }
      });
    return () => { abort.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialData only seeds the first render; versions reload when company or initial version change
  }, [companyId, initialVersionId]);
  useEffect(() => {
    setQuery("");
    setSection("");
    setOrigin("");
    setReview("");
    setCoverage("");
  }, [companyId, versionId]);
  useEffect(() => {
    // Loading a view supersedes every draft read still on its way.
    const epoch = ++readEpoch.current;
    const current = () => readEpoch.current === epoch;
    activeRead.current?.abort();
    setRefreshing(false);
    if (initialData && !initializedView.current) {
      initializedView.current = true;
      return;
    }
    initializedView.current = true;
    if (!versionId || !companyId) {
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setStaleDraft(null);
    setEntries([]);
    setPayload(null);
    setCitationContext(undefined);
    setCanEdit(false);
    const request =
      versionId === "draft"
        ? api<{
            actorId?: string;
            draftGeneration?: number;
            company: { name: string; role: string; archived_at: string | null };
            entries: ViewEntry[];
            citationContext?: CitationContext;
          }>(companyPath(companyId, "/draft"), { signal: abort.signal }).then(
            (data) => {
              if (abort.signal.aborted || !current()) {
                return;
              }
              setActorId(data.actorId ?? "");
              setGeneration(data.draftGeneration ?? null);
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
            if (abort.signal.aborted || !current()) {
              return;
            }
            setPayload(data);
            setName(data.provenance.company.name);
            setEntries(snapshotEntries(data));
          });
    request
      .catch((error: unknown) => {
        if (!abort.signal.aborted && current()) {
          setError((error as Error).message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted && current()) {
          setLoading(false);
        }
      });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- readEpoch is a plain counter (not a DOM ref); the cleanup must bump the current value
      readEpoch.current++;
      activeRead.current?.abort();
      abort.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialData only seeds the first render; the read restarts on company/version/reload only
  }, [companyId, versionId, reload]);
  /**
   * Re-reads the draft after a save so the view shows it, without blanking the page. The save is
   * already committed when this runs, so the returned promise never rejects (the caller must not
   * treat the save as failed or send it again). A failed or slow read marks the view stale, which
   * blocks further imports and offers a reload, until a later read succeeds.
   *
   * Only the read started last for the company and draft the view is showing may apply its result
   * (success, failure or timeout). A read that was superseded by a newer read, or by navigation to
   * another version or company, resolves quietly and changes nothing.
   */
  async function refreshDraft(what?: "changes", userInitiated = false) {
    const forCompany = companyId;
    const current = viewNow.current;
    if (current.companyId !== forCompany || current.versionId !== "draft") {
      return;
    }
    const mine = ++readEpoch.current;
    const latest = () => readEpoch.current === mine;
    setRefreshing(true);
    // An older read is not aborted here: the locked ordering tests keep it pending until it answers.
    const read = new AbortController();
    activeRead.current = read;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = api<{
        draftGeneration?: number;
        company: { name?: string; role: string; archived_at: string | null };
        entries: ViewEntry[];
        citationContext?: CitationContext;
      }>(companyPath(forCompany, "/draft"), { signal: read.signal });
      // A read that does not settle in time leaves the view stale (a save stands, and is never sent
      // again). The read after a save keeps timing.reread; a Reload the person asked for gets the
      // longer timing.reload, so its button cannot stay disabled for ever.
      const data = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              read.abort();
              reject(new Error("The draft was not read in time."));
            },
            userInitiated ? timing.reload : timing.reread,
          );
        }),
      ]);
      if (!latest()) {
        return;
      }
      setCanEdit(data.company.role !== "viewer" && !data.company.archived_at);
      setGeneration(data.draftGeneration ?? null);
      if (data.company.name) {
        setName(data.company.name);
      }
      setEntries(data.entries);
      setCitationContext(data.citationContext);
      setStaleDraft(null);
      setError("");
      setLoading(false);
    } catch (error) {
      if (!latest()) {
        return;
      }
      setLoading(false);
      setStaleWhat(userInitiated ? staleWhatNow.current : (what ?? "links"));
      setStaleDraft((error as Error).message || "The draft could not be read.");
    } finally {
      clearTimeout(timer);
      if (activeRead.current === read) {
        activeRead.current = null;
      }
      if (latest()) {
        setRefreshing(false);
      }
    }
  }
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
          onClick={() => { setHistory(entry); }}
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
        provenance: entries.find((original) => original.id === entry.id)!
          .provenance,
      })),
    [companyId, entries, section, review, origin, coverage, query],
  );
  if (!companyId) {
    return (
      <Notice error>
        Select a company from the dashboard.{" "}
        <Link href="/dashboard">View companies</Link>
      </Notice>
    );
  }
  const profileMode = mode === "profile";
  const heading = (entry: ViewEntry) =>
    "name" in entry.content && entry.content.name
      ? entry.content.name
      : CATEGORY_SPECS[entry.kind].label;
  return (
    <div className="version-viewer knowledge-view">
      <h1 className="sr-only">{name}</h1>
      <div className="knowledge-view__toolbar">
        <div className="knowledge-view__toolbar-group">
          <select
            className="company-switcher"
            aria-label="Switch company"
            value={companyId}
            onChange={(event) =>
              { window.location.assign(
                `/knowledge/view?companyId=${event.target.value}`,
              ); }
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
          <div className="actions" aria-label="Display mode">
            {["profile", "cards", "table", "detail", "json"].map((item) => (
              <button
                className="button"
                key={item}
                onClick={() => { setMode(item); }}
                aria-pressed={mode === item}
              >
                {labelOf(item)}
              </button>
            ))}
          </div>
        </div>
        <div className="knowledge-view__toolbar-group">
          {payload && (
            <span className="knowledge-view__status">
              Version {payload.version} · saved{" "}
              {new Date(payload.saved_at).toLocaleString()} · read only
            </span>
          )}
          <Link className="button" href={`/knowledge?companyId=${companyId}`}>
            Open current draft
          </Link>
          <form className="actions version-viewer__export" action={companyPath(companyId, "/document")} method="GET">
            <input type="hidden" name="versionId" value={versionId} />
            <select
              className="company-switcher version-viewer__export-format"
              name="format"
              aria-label="Export format"
              value={exportFormat}
              onChange={(event) => { setExportFormat(event.target.value); }}
              disabled={loading || !versionId}
            >
              <option value="json">JSON (.json)</option>
              <option value="docx">Word (.docx)</option>
              <option value="pdf">PDF (.pdf)</option>
            </select>
            <button
              className="button version-viewer__document-export"
              type="submit"
              disabled={loading || !versionId || (versionId !== "draft" && !payload)}
              title="Export all saved values and supporting evidence, regardless of filters"
            >
              Export {exportFormat.toUpperCase()} ↓
            </button>
          </form>
          {payload && (
            <a
              className="button"
              href={companyPath(companyId, `/versions/${versionId}/download`)}
            >
              Download JSON ↓
            </a>
          )}
        </div>
      </div>
      {staleDraft !== null && versionId === "draft" && (
        <Notice>
          {`Saved. Reload to see the latest ${staleWhat}. The draft could not be read: ${staleDraft}`}{" "}
          <button
            type="button"
            className="button"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={() => void refreshDraft(undefined, true)}
          >
            {refreshing ? "Reloading…" : "Reload"}
          </button>
        </Notice>
      )}
      {error && (
        <Notice error>
          {error}
          {canEdit && versionId === "draft" && (
            <button
              className="button"
              onClick={() => { setReload((value) => value + 1); }}
            >
              Reload latest draft
            </button>
          )}
        </Notice>
      )}
      {profileMode ? (
        <>
          <nav className="knowledge-view__nav" aria-label="Knowledge navigation">
            <div className="knowledge-view__nav-box">
              <span className="knowledge-view__tab" aria-current="page">Company</span>
            </div>
            <div className="knowledge-view__nav-box">
            <SectionListbox
              value={knowledgeSection}
              onSelect={(next) => {
                setKnowledgeSection(next);
                const url = new URL(window.location.href);
                url.searchParams.set("section", next);
                window.history.replaceState(null, "", url);
              }}
            />
            </div>
          </nav>
          <div className="knowledge-view__panel">
            {loading ? (
              <Notice>Loading knowledge…</Notice>
            ) : (
              <SectionView
                section={knowledgeSection}
                companyId={companyId}
                name={name}
                entries={entries}
                citationContext={citationContext}
                canEdit={canEdit && versionId === "draft"}
                actorId={actorId}
                generation={generation}
                importBlocked={staleDraft !== null}
                onSaved={(what) => refreshDraft(what)}
                offeringId={offeringId}
                onSelectOffering={(id) => {
                  setOfferingId(id);
                  const url = new URL(window.location.href);
                  url.searchParams.set("offering", id);
                  window.history.replaceState(null, "", url);
                }}
                personId={personId}
                onSelectPerson={(id) => {
                  setPersonId(id);
                  const url = new URL(window.location.href);
                  if (id) {
                    url.searchParams.set("person", id);
                  } else {
                    url.searchParams.delete("person");
                  }
                  window.history.replaceState(null, "", url);
                }}
              />
            )}
          </div>
          <p className="knowledge-view__tip">
            <span aria-hidden="true">ⓘ</span> Tip: keep company facts specific and evidence based. Anything missing can be filled in from the editor.
          </p>
          <SourceCoverage key={companyId} companyId={companyId} viewingSnapshot={versionId !== "draft"} />
          {versionId === "draft" && !loading && entries.length > 0 && (
            <details className="knowledge-view__review">
              <summary>Review draft entries ({entries.length})</summary>
              <ul>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="knowledge-view__review-name">{heading(entry)}</span>
                    <StatusBadge value={entry.review_status} />
                    {draftActions(entry)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
      <div className="panel">
        <div className="version-viewer__filters">
          <input
            className="filter-input"
            aria-label="Search company knowledge"
            placeholder="Search this company's knowledge…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); }}
          />
          <select
            className="filter-input"
            aria-label="Filter section"
            value={section}
            onChange={(e) => { setSection(e.target.value); }}
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
            onChange={(e) => { setOrigin(e.target.value); }}
          >
            <option value="">All origins</option>
            {["source_backed", "inferred", "generated", "user_provided"].map(
              (v) => (
                <option key={v} value={v}>
                  {["generated", "inferred"].includes(v)
                    ? "Historical "
                    : ""}
                  {labelOf(v)}
                </option>
              ),
            )}
          </select>
          <select
            className="filter-input"
            aria-label="Filter review status"
            value={review}
            onChange={(e) => { setReview(e.target.value); }}
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
            onChange={(e) => { setCoverage(e.target.value); }}
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
        <SourceCoverage key={companyId} companyId={companyId} viewingSnapshot={versionId !== "draft"} />
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
                      ? e.content.name ?? "Unnamed"
                      : CATEGORY_SPECS[e.kind].label}
                  </td>
                  <td>{CATEGORY_SPECS[e.kind].label}</td>
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
          <div className={mode === "cards" ? "version-viewer__grid" : ""}>
            {filtered.map((e) => {
              const root =
                e.kind === "key_person"
                  ? `/key_people/@${(e.content as { id: string }).id}`
                  : e.kind === "offering"
                    ? `/offerings/@${(e.content as { id: string }).id}`
                    : `/${e.kind}`;
              return (
                <article className="version-viewer__entry" key={e.id}>
                  <div className="section-heading">
                    <h3>
                      {"name" in e.content
                        ? (e.content.name ?? CATEGORY_SPECS[e.kind].label)
                        : CATEGORY_SPECS[e.kind].label}
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
                              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- walks untyped JSON (unknown narrowed by Array.isArray/in checks to any); values are checked structurally at each use
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
      )}
      {history && (
        <EntryHistory
          companyId={companyId}
          kind={history.kind}
          entryId={history.id}
          revision={history.current_revision}
          canEdit={canEdit && versionId === "draft"}
          onClose={() => { setHistory(null); }}
          onRestore={() => { setReload((value) => value + 1); }}
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
