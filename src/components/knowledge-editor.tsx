"use client";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useState } from "react";
import {
  createEntryDefault,
  createEmptyProvenance,
  parseBusinessEntry,
  type BusinessEntry,
  type EntryKind,
  type EntryProvenance,
} from "@/contracts";
import { api, ApiError, companyPath, write } from "./api-client";
import { CATEGORY_SPECS } from "./business-fields";
import { BusinessField } from "./business-form";
import { EmptyState, Notice, StatusBadge } from "./ui";
import { ScrapeProgress } from "./scrape-progress";
import { EntryHistory } from "./entry-history";
import { PublicationDialog } from "./publication-dialog";
import { CompanySettings } from "./company-settings";
import { ProposalReview } from "./proposal-review";
type Entry = {
  id: string;
  kind: EntryKind;
  current_revision: number;
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: "unreviewed" | "approved" | "rejected";
};
type Draft = {
  company: {
    id: string;
    name: string;
    website_url: string;
    role: string;
    archived_at: string | null;
  };
  draftGeneration: number;
  actorId: string;
  entries: Entry[];
};
type EditorState = {
  category: EntryKind;
  values: Record<string, BusinessEntry>;
  provenance: Record<string, EntryProvenance>;
  dirty: string[];
};
type Action =
  | { type: "category"; category: EntryKind }
  | { type: "edit"; id: string; content: BusinessEntry }
  | { type: "provenance"; id: string; provenance: EntryProvenance }
  | { type: "saved"; id: string };
function reducer(state: EditorState, action: Action): EditorState {
  if (action.type === "category")
    return { ...state, category: action.category };
  if (action.type === "saved") {
    const values = { ...state.values };
    const provenance = { ...state.provenance };
    delete values[action.id];
    delete provenance[action.id];
    return {
      ...state,
      values,
      provenance,
      dirty: state.dirty.filter((id) => id !== action.id),
    };
  }
  if (action.type === "edit")
    return {
      ...state,
      values: { ...state.values, [action.id]: action.content },
      dirty: [...new Set([...state.dirty, action.id])],
    };
  return {
    ...state,
    provenance: { ...state.provenance, [action.id]: action.provenance },
    dirty: [...new Set([...state.dirty, action.id])],
  };
}
export function KnowledgeEditor({ companyId }: { companyId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [state, dispatch] = useReducer(reducer, {
    category: "company_foundation",
    values: {},
    provenance: {},
    dirty: [],
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<Entry | null>(null);
  const [publish, setPublish] = useState(false);
  const [settings, setSettings] = useState(false);
  const [stale, setStale] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>(
    [],
  );
  const refresh = useCallback(() => {
    api<Draft>(companyPath(companyId, "/draft"))
      .then(setDraft)
      .catch((e) => setError(e.message));
  }, [companyId]);
  useEffect(() => {
    refresh();
    api<{ companies: { id: string; name: string }[] }>("/api/companies")
      .then((data) => setCompanies(data.companies))
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    if (!state.dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.dirty]);
  if (!companyId)
    return (
      <Notice error>
        Select a company from the dashboard to open its workspace.{" "}
        <Link href="/dashboard">View companies</Link>
      </Notice>
    );
  if (!draft)
    return error ? (
      <Notice error>{error}</Notice>
    ) : (
      <Notice>Loading company knowledge…</Notice>
    );
  const canEdit = draft.company.role !== "viewer" && !draft.company.archived_at;
  const spec = CATEGORY_SPECS[state.category]!;
  const entries = draft.entries.filter((e) => e.kind === state.category);
  const visibleEntries = entries.length
    ? entries
    : state.category === "key_person" || state.category === "offering"
      ? []
      : [
          {
            id: `new-${state.category}`,
            kind: state.category,
            current_revision: 0,
            content: createEntryDefault(state.category),
            provenance: createEmptyProvenance(),
            review_status: "unreviewed" as const,
          },
        ];
  function changeCategory(category: EntryKind) {
    dispatch({ type: "category", category });
  }
  async function save(entry: Entry, status: Entry["review_status"]) {
    setError("");
    setMessage("");
    setBusy(entry.id);
    try {
      const content = state.values[entry.id] ?? entry.content;
      parseBusinessEntry(entry.kind, content);
      const provenance = structuredClone(
        state.provenance[entry.id] ?? entry.provenance,
      );
      if (!provenance.coverage.length) {
        const root =
          entry.kind === "key_person"
            ? `/key_people/@${(content as { id: string }).id}`
            : entry.kind === "offering"
              ? `/offerings/@${(content as { id: string }).id}`
              : `/${entry.kind}`;
        provenance.coverage = Object.keys(
          CATEGORY_SPECS[entry.kind]!.fields,
        ).map((key) => ({
          targets: [`${root}/${key}`],
          status: "not_checked" as const,
          job_id: null,
          reason:
            "Manually entered section. Website coverage has not been checked.",
        }));
      }
      const isNew = entry.current_revision === 0;
      const requestId = crypto.randomUUID();
      const result = await api<Entry>(
        companyPath(
          companyId,
          isNew ? "/entries" : `/entries/${entry.id}/revisions`,
        ),
        write(
          "POST",
          isNew
            ? { kind: entry.kind, content, provenance, requestId }
            : {
                expectedRevision: entry.current_revision,
                content,
                provenance,
                reviewStatus: status,
                reason: state.dirty.includes(entry.id)
                  ? "User reviewed and corrected company knowledge."
                  : "Review status updated.",
                requestId,
              },
        ),
      );
      if (isNew && status !== "unreviewed") {
        await api(
          companyPath(companyId, `/entries/${result.id}/revisions`),
          write("POST", {
            expectedRevision: 1,
            content: result.content ?? content,
            provenance: result.provenance ?? provenance,
            reviewStatus: status,
            requestId: crypto.randomUUID(),
          }),
        );
      }
      dispatch({ type: "saved", id: entry.id });
      setStale(false);
      setMessage(
        status === "approved"
          ? "Entry saved and approved."
          : status === "rejected"
            ? "Entry rejected. It will be excluded from future snapshots."
            : "Draft saved. Your changes have a new revision.",
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setStale(true);
    } finally {
      setBusy(null);
    }
  }
  function resolveConflict(
    entry: Entry,
    conflictId: string,
    candidateId: string | null,
    nextValue: unknown,
  ) {
    const provenance = structuredClone(
      state.provenance[entry.id] ?? entry.provenance,
    );
    const conflict = provenance.conflicts.find((c) => c.id === conflictId)!;
    const content = structuredClone(
      state.values[entry.id] ?? entry.content,
    ) as Record<string, unknown>;
    const segments = conflict.target
      .split("/")
      .slice(2)
      .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
    if (entry.kind === "key_person" || entry.kind === "offering")
      segments.shift();
    let target: unknown = content;
    for (const segment of segments.slice(0, -1)) {
      target = segment.startsWith("@")
        ? (target as { id: string }[]).find((x) => x.id === segment.slice(1))
        : (target as Record<string, unknown>)[segment];
    }
    if (target && segments.length)
      (target as Record<string, unknown>)[segments.at(-1)!] = nextValue;
    provenance.decisions.push({
      id: crypto.randomUUID(),
      conflict_id: conflictId,
      target: conflict.target,
      action: candidateId ? "select" : "clear",
      candidate_id: candidateId,
      actor_id: draft!.actorId,
      decided_at: new Date().toISOString(),
      note: candidateId
        ? "Reviewer selected this source candidate."
        : "Reviewer cleared the disputed value.",
    });
    dispatch({ type: "edit", id: entry.id, content: content as BusinessEntry });
    dispatch({ type: "provenance", id: entry.id, provenance });
  }
  function addRepeatable() {
    const id = crypto.randomUUID();
    const entry: Entry = {
      id,
      kind: state.category,
      current_revision: 0,
      content: createEntryDefault(state.category, id),
      provenance: createEmptyProvenance(),
      review_status: "unreviewed",
    };
    setDraft({ ...draft!, entries: [...draft!.entries, entry] });
    dispatch({ type: "edit", id, content: entry.content });
  }
  return (
    <div className="knowledge-editor">
      <div className="breadcrumb">
        <Link href="/dashboard">Companies</Link>
        <span>/</span>
        <span>{draft.company.name}</span>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Scrape & build</p>
          <h1>{draft.company.name}</h1>
          <p>Review the facts. Refine the story. Keep the evidence.</p>
        </div>
        <div className="actions">
          <select
            aria-label="Switch company"
            className="company-switcher"
            value={companyId}
            onChange={(e) => {
              if (
                !state.dirty.length ||
                window.confirm(
                  "Leave this company and discard unsaved changes?",
                )
              )
                window.location.assign(
                  `/knowledge?companyId=${e.target.value}`,
                );
            }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Link
            className="button"
            href={`/knowledge/view?companyId=${companyId}`}
          >
            View knowledge
          </Link>
          <button
            className="button button--primary"
            disabled={!canEdit || state.dirty.length > 0}
            onClick={() => setPublish(true)}
          >
            Save knowledge version
          </button>
          {draft.company.role === "owner" && (
            <button
              className="button"
              onClick={() => setSettings(true)}
              aria-label="Company settings"
            >
              ⚙
            </button>
          )}
        </div>
      </div>
      <div className="section-heading">
        <span className="muted">
          Current draft · generation {draft.draftGeneration}
        </span>
        <div className="actions">
          <StatusBadge value={draft.company.role} />
          {state.dirty.length > 0 && <StatusBadge value="unsaved_changes" />}
        </div>
      </div>
      {!canEdit && (
        <Notice>
          {draft.company.archived_at
            ? "This company is archived. Saved knowledge and history remain available."
            : "You have viewer access. You can inspect evidence and download saved versions."}
        </Notice>
      )}
      <ScrapeProgress
        companyId={companyId}
        website={draft.company.website_url}
        canEdit={canEdit}
        onComplete={refresh}
      />
      {error && (
        <Notice error>
          {error}
          {stale && (
            <>
              <p>
                Your edits are still here. Load the latest saved revision,
                compare it with your changes, then save again.
              </p>
              <button
                className="button"
                onClick={() => {
                  refresh();
                  setMessage(
                    "Latest saved revisions loaded. Unsaved values have been preserved for comparison.",
                  );
                }}
              >
                Load latest revisions
              </button>
            </>
          )}
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <div className="knowledge-editor__layout">
        <nav className="category-nav" aria-label="Knowledge categories">
          {Object.entries(CATEGORY_SPECS).map(([kind, category]) => {
            const group = draft.entries.filter((e) => e.kind === kind);
            return (
              <button
                type="button"
                key={kind}
                className={`category-nav__item${state.category === kind ? " category-nav__item--active" : ""}`}
                onClick={() => changeCategory(kind as EntryKind)}
                aria-current={state.category === kind ? "page" : undefined}
              >
                <span aria-hidden>{category.icon}</span>
                <span>{category.label}</span>
                <span className="category-nav__count">
                  {group.filter((e) => e.review_status === "approved").length}/
                  {group.length ||
                    (["key_person", "offering"].includes(kind) ? 0 : 1)}
                </span>
              </button>
            );
          })}
        </nav>
        <section className="knowledge-editor__content">
          <div className="knowledge-editor__header">
            <div className="section-heading">
              <h2>{spec.label}</h2>
              {canEdit &&
                ["key_person", "offering"].includes(state.category) && (
                  <button className="button" onClick={addRepeatable}>
                    ＋ Add{" "}
                    {state.category === "key_person" ? "person" : "offering"}
                  </button>
                )}
            </div>
            <p>{spec.description}</p>
          </div>
          {visibleEntries.length === 0 && (
            <div className="panel">
              <EmptyState
                title={`No ${state.category === "key_person" ? "people" : "offerings"} recorded`}
              >
                <p>
                  Add an entry manually or capture the company website. Each
                  entry has its own review decision.
                </p>
              </EmptyState>
            </div>
          )}
          {visibleEntries.map((entry) => {
            const value = state.values[entry.id] ?? entry.content;
            const provenance = state.provenance[entry.id] ?? entry.provenance;
            const root =
              entry.kind === "key_person"
                ? `/key_people/@${(value as { id: string }).id}`
                : entry.kind === "offering"
                  ? `/offerings/@${(value as { id: string }).id}`
                  : `/${entry.kind}`;
            const conflicts = provenance.conflicts.filter(
              (c) =>
                c.material &&
                !provenance.decisions.some((d) => d.conflict_id === c.id),
            );
            return (
              <article className="knowledge-editor__entry panel" key={entry.id}>
                <div className="section-heading">
                  <div className="actions">
                    <h3>
                      {"name" in value && value.name
                        ? String(value.name)
                        : spec.label}
                    </h3>
                    <StatusBadge
                      value={
                        state.dirty.includes(entry.id)
                          ? "unreviewed"
                          : entry.review_status
                      }
                    />
                  </div>
                  <span className="field__hint">
                    {entry.current_revision
                      ? `Revision ${entry.current_revision}`
                      : "New entry"}
                  </span>
                </div>
                {conflicts.length > 0 && (
                  <Notice error>
                    {conflicts.length} unresolved conflict
                    {conflicts.length === 1 ? "" : "s"}. Choose or clear a value
                    before approval.
                    {conflicts.map((conflict) => (
                      <div key={conflict.id}>
                        <p>{conflict.target}</p>
                        {conflict.candidates.map((candidate) => (
                          <button
                            className="button"
                            type="button"
                            key={candidate.id}
                            disabled={!canEdit}
                            onClick={() => {
                              resolveConflict(
                                entry,
                                conflict.id,
                                candidate.id,
                                candidate.value,
                              );
                            }}
                          >
                            {typeof candidate.value === "string"
                              ? candidate.value
                              : JSON.stringify(candidate.value)}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="button"
                          disabled={!canEdit}
                          onClick={() =>
                            resolveConflict(entry, conflict.id, null, null)
                          }
                        >
                          Clear disputed value
                        </button>
                      </div>
                    ))}
                  </Notice>
                )}
                <div className="field-grid">
                  {Object.entries(spec.fields).map(([key, field]) => (
                    <BusinessField
                      key={key}
                      spec={field}
                      name={key}
                      path={`${root}/${key}`}
                      value={(value as Record<string, unknown>)[key]}
                      disabled={!canEdit || busy === entry.id}
                      provenance={provenance}
                      approved={entry.review_status === "approved"}
                      onChange={(next) =>
                        dispatch({
                          type: "edit",
                          id: entry.id,
                          content: { ...value, [key]: next } as BusinessEntry,
                        })
                      }
                    />
                  ))}
                </div>
                <div className="knowledge-editor__toolbar">
                  <button
                    className="button"
                    disabled={!canEdit || busy !== null}
                    onClick={() => save(entry, "unreviewed")}
                  >
                    {busy === entry.id ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    className="button button--primary"
                    disabled={!canEdit || busy !== null || conflicts.length > 0}
                    onClick={() => save(entry, "approved")}
                  >
                    {state.dirty.includes(entry.id)
                      ? "Save and approve"
                      : "Approve unchanged"}
                  </button>
                  <button
                    className="button button--quiet button--danger"
                    disabled={!canEdit || busy !== null}
                    onClick={() => save(entry, "rejected")}
                  >
                    Reject
                  </button>
                  <button
                    className="button button--quiet"
                    disabled={!entry.current_revision}
                    onClick={() => setHistory(entry)}
                  >
                    History
                  </button>
                  <span className="field__hint">
                    Unknown values do not prevent approval.
                  </span>
                </div>
              </article>
            );
          })}
          <ProposalReview
            companyId={companyId}
            entries={draft.entries}
            canEdit={canEdit}
            onApplied={refresh}
          />
        </section>
      </div>
      {history && (
        <EntryHistory
          companyId={companyId}
          entryId={history.id}
          revision={history.current_revision}
          canEdit={canEdit}
          onClose={() => setHistory(null)}
          onRestore={refresh}
        />
      )}
      {publish && (
        <PublicationDialog
          companyId={companyId}
          onClose={() => setPublish(false)}
          onSaved={() => {
            setMessage("Knowledge version saved. The snapshot is permanent.");
            refresh();
          }}
        />
      )}
      {settings && (
        <CompanySettings
          companyId={companyId}
          company={draft.company}
          generation={draft.draftGeneration}
          onClose={() => setSettings(false)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
