"use client";
import Link from "next/link";
import { ZodError } from "zod";
import { useUnsavedNavigation } from "./unsaved-navigation";
import { ValueView } from "./entry-value";
import { CitationPopover } from "./citation-popover";
import { CompanyDraftProvider, useCompanyDraft } from "./company-draft-context";
import { applyConflictDecision } from "@/knowledge/conflict-decisions";
import { useCallback, useEffect, useState } from "react";
import type { DraftEntry, DraftResponse } from "@/contracts/api-types";
import {
  createEntryDefault,
  entryBusiness,
  resolveStablePointer,
  createEmptyProvenance,
  parseBusinessEntry,
  type BusinessEntry,
  type CitationContext,
  type EntryKind,
} from "@/contracts";
import { api, ApiError, companyPath, write } from "./api-client";
import { CATEGORY_SPECS, labelOf, summarizeValue } from "./business-fields";
import { BusinessField } from "./business-form";
import { EmptyState, Notice, StatusBadge, useHydrated } from "./ui";
import { ScrapeProgress } from "./scrape-progress";
import { EntryHistory } from "./entry-history";
import { PublicationDialog } from "./publication-dialog";
import { CompanySettings } from "./company-settings";
import { ProposalReview } from "./proposal-review";
type Entry = Pick<
  DraftEntry,
  | "id"
  | "kind"
  | "current_revision"
  | "content"
  | "provenance"
  | "review_status"
>;
type Draft = Omit<DraftResponse, "company" | "entries"> & {
  company: Omit<DraftResponse["company"], "latestJob" | "latestVersion">;
  entries: Entry[];
  citationContext?: CitationContext;
};
export function KnowledgeEditor(props: {
  companyId: string;
  initialDraft?: Draft;
}) {
  return (
    <CompanyDraftProvider key={props.companyId} companyId={props.companyId}>
      <KnowledgeEditorContent {...props} />
    </CompanyDraftProvider>
  );
}
function KnowledgeEditorContent({
  companyId,
  initialDraft,
}: {
  companyId: string;
  initialDraft?: Draft;
}) {
  const [draft, setDraft] = useState<Draft | null>(initialDraft ?? null);
  const { state, dispatch } = useCompanyDraft();
  const hydrated = useHydrated();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<Entry | null>(null);
  const [publish, setPublish] = useState(false);
  const [settings, setSettings] = useState(false);
  const [stale, setStale] = useState(false);
  const [savedAwaitingRefresh, setSavedAwaitingRefresh] = useState<string | null>(
    null,
  );
  const [genderAttestations, setGenderAttestations] = useState<
    Record<string, string>
  >({});
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>(
    [],
  );
  const refresh = useCallback(async () => {
    try {
      setDraft(await api<Draft>(companyPath(companyId, "/draft")));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, [companyId]);
  useEffect(() => {
    const category = new URLSearchParams(window.location.search).get(
      "category",
    );
    if (category && CATEGORY_SPECS[category])
      dispatch({ type: "category", category: category as EntryKind });
  }, []);
  useEffect(() => {
    if (!initialDraft) refresh();
    api<{ companies: { id: string; name: string }[] }>("/api/companies")
      .then((data) => setCompanies(data.companies))
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    const entryId = new URLSearchParams(window.location.search).get("entryId");
    if (entryId && draft)
      document
        .getElementById(`entry-${entryId}`)
        ?.scrollIntoView({ block: "center" });
  }, [draft, state.category]);
  const canNavigate = useUnsavedNavigation(state.dirty.length > 0);
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
  const membershipCanEdit =
    draft.company.role !== "viewer" && !draft.company.archived_at;
  const canEdit =
    hydrated && membershipCanEdit && busy === null && !savedAwaitingRefresh;
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
      const genderChanged =
        entry.kind === "key_person" &&
        "gender" in content &&
        content.gender !== null &&
        content.gender !== (entry.content as { gender: string | null }).gender;
      if (
        genderChanged &&
        (genderAttestations[entry.id]?.trim().length ?? 0) < 10
      )
        throw new Error(
          "Provide an explicit self-description attestation for the gender value, or leave gender unknown.",
        );
      const genderAttestation = genderChanged
        ? genderAttestations[entry.id]?.trim()
        : undefined;
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
      const result = await api<Entry & { entry_id?: string }>(
        companyPath(
          companyId,
          isNew ? "/entries" : `/entries/${entry.id}/revisions`,
        ),
        write(
          "POST",
          isNew
            ? {
                kind: entry.kind,
                content,
                provenance,
                genderAttestation,
                requestId,
              }
            : {
                expectedRevision: entry.current_revision,
                content,
                provenance,
                reviewStatus: status,
                genderAttestation,
                reason: state.dirty.includes(entry.id)
                  ? "User reviewed and corrected company knowledge."
                  : "Review status updated.",
                requestId,
              },
        ),
      );
      if (isNew && status !== "unreviewed") {
        await api(
          companyPath(
            companyId,
            `/entries/${result.entry_id ?? result.id}/revisions`,
          ),
          write("POST", {
            expectedRevision: 1,
            content: result.content ?? content,
            provenance: result.provenance ?? provenance,
            reviewStatus: status,
            requestId: crypto.randomUUID(),
          }),
        );
      }
      // The server may normalize conflict decisions and content. Keep local edits
      // and controls locked until that authoritative revision is available.
      setSavedAwaitingRefresh(entry.id);
      if (!(await refresh())) return;
      dispatch({ type: "saved", id: entry.id });
      setSavedAwaitingRefresh(null);
      setStale(false);
      setMessage(
        status === "approved"
          ? "Entry saved and approved."
          : status === "rejected"
            ? "Entry rejected. It will be excluded from future snapshots."
            : "Draft saved. Your changes have a new revision.",
      );
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues
              .map(
                (issue) =>
                  `${issue.path.join(" › ").replaceAll("_", " ")}: ${issue.message}`,
              )
              .join("; ")
          : (e as Error).message,
      );
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
    action: "select" | "clear" | "correct" = candidateId ? "select" : "clear",
  ) {
    try {
      const provenance = structuredClone(
        state.provenance[entry.id] ?? entry.provenance,
      );
      const conflict = provenance.conflicts.find(
        (item) => item.id === conflictId,
      )!;
      const currentBusiness = entryBusiness(
        entry.kind,
        state.values[entry.id] ?? entry.content,
      );
      const correction =
        action === "correct"
          ? resolveStablePointer(currentBusiness, conflict.target)
          : nextValue;
      const { business, decision } = applyConflictDecision(
        currentBusiness,
        conflict,
        {
          id: crypto.randomUUID(),
          conflict_id: conflictId,
          target: conflict.target,
          action,
          candidate_id: candidateId,
          actor_id: draft!.actorId,
          decided_at: new Date().toISOString(),
          note:
            action === "select"
              ? "Reviewer selected this source candidate."
              : action === "correct"
                ? "Reviewer supplied the edited field value as a correction."
                : "Reviewer cleared the disputed value.",
        },
        correction,
      );
      provenance.decisions.push(decision);
      const content =
        entry.kind === "key_person"
          ? (business.key_people as BusinessEntry[])[0]!
          : entry.kind === "offering"
            ? (business.offerings as BusinessEntry[])[0]!
            : (business[entry.kind] as BusinessEntry);
      dispatch({ type: "edit", id: entry.id, content });
      dispatch({ type: "provenance", id: entry.id, provenance });
    } catch (error) {
      setError((error as Error).message);
    }
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
              if (canNavigate())
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
          {draft.company.role !== "viewer" && (
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
      {!membershipCanEdit && (
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
          {savedAwaitingRefresh && (
            <>
              <p>
                Your revision was saved, but the latest draft could not be loaded.
                Load it before making more changes. Your edits are still here.
              </p>
              <button
                className="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(savedAwaitingRefresh);
                  if (await refresh()) {
                    dispatch({ type: "saved", id: savedAwaitingRefresh });
                    setSavedAwaitingRefresh(null);
                    setStale(false);
                    setError("");
                    setMessage("Latest saved revisions loaded.");
                  }
                  setBusy(null);
                }}
              >
                Load saved revision
              </button>
            </>
          )}
          {stale && !savedAwaitingRefresh && (
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
              {draft.entries
                .filter((entry) => state.dirty.includes(entry.id))
                .map((entry) => (
                  <details key={entry.id}>
                    <summary>
                      Compare {CATEGORY_SPECS[entry.kind]!.label} with the
                      latest saved revision
                    </summary>
                    <div className="proposal__comparison">
                      <div>
                        <h3>Latest saved revision {entry.current_revision}</h3>
                        <ValueView
                          value={entry.content}
                          path={`/${entry.kind}`}
                          provenance={entry.provenance}
                          citationContext={draft.citationContext}
                          approved={entry.review_status === "approved"}
                        />
                      </div>
                      <div>
                        <h3>Your unsaved values</h3>
                        <ValueView
                          value={state.values[entry.id]}
                          path={`/${entry.kind}`}
                          citationContext={draft.citationContext}
                          provenance={
                            state.provenance[entry.id] ?? entry.provenance
                          }
                          approved={false}
                        />
                      </div>
                    </div>
                  </details>
                ))}
            </>
          )}
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <div className="knowledge-editor__layout">
        <nav className="category-nav" aria-label="Knowledge categories">
          {Object.entries(CATEGORY_SPECS).map(([kind, category]) => {
            const group = draft.entries.filter((e) => e.kind === kind);
            const coverage = group.flatMap(
              (entry) =>
                (state.provenance[entry.id] ?? entry.provenance).coverage,
            );
            const assessed = coverage
              .filter((item) => item.status !== "not_checked")
              .reduce((total, item) => total + item.targets.length, 0);
            const fieldCount =
              group.length * Object.keys(category.fields).length ||
              (["key_person", "offering"].includes(kind)
                ? 0
                : Object.keys(category.fields).length);
            return (
              <button
                type="button"
                key={kind}
                className={`category-nav__item${state.category === kind ? " category-nav__item--active" : ""}`}
                onClick={() => changeCategory(kind as EntryKind)}
                disabled={!hydrated}
                aria-current={state.category === kind ? "page" : undefined}
              >
                <span aria-hidden>{category.icon}</span>
                <span>
                  {category.label}
                  <small className="category-nav__coverage">
                    {assessed}/{fieldCount} fields checked
                  </small>
                </span>
                <span className="category-nav__count">
                  {group.filter((e) => e.review_status === "approved").length}/
                  {group.length ||
                    (["key_person", "offering"].includes(kind) ? 0 : 1)}{" "}
                  reviewed
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
              <article
                className="knowledge-editor__entry panel"
                id={`entry-${entry.id}`}
                key={entry.id}
              >
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
                    {conflicts.length === 1 ? "" : "s"}. Choose a source, supply
                    a correction, or clear a value before approval.
                    {conflicts.map((conflict) => (
                      <div key={conflict.id}>
                        <p>
                          <strong>
                            {labelOf(
                              conflict.target.split("/").at(-1) ?? "Field",
                            )}
                          </strong>
                        </p>
                        {conflict.candidates.map((candidate) => (
                          <div className="actions" key={candidate.id}>
                            <button
                              className="button knowledge-editor__candidate"
                              type="button"
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
                              {summarizeValue(candidate.value)}
                            </button>
                            <CitationPopover
                              path={conflict.target}
                              provenance={provenance}
                              citationContext={draft.citationContext}
                              candidate={candidate}
                            />
                          </div>
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
                        <button
                          type="button"
                          className="button"
                          disabled={!canEdit || !state.dirty.includes(entry.id)}
                          onClick={() =>
                            resolveConflict(
                              entry,
                              conflict.id,
                              null,
                              null,
                              "correct",
                            )
                          }
                        >
                          Use my edited value as correction
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
                      citationContext={draft.citationContext}
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
                {entry.kind === "key_person" &&
                  "gender" in value &&
                  value.gender !== null &&
                  value.gender !==
                    (entry.content as { gender: string | null }).gender && (
                    <label className="field">
                      <span className="field__label">
                        Gender self-description attestation
                      </span>
                      <textarea
                        value={genderAttestations[entry.id] ?? ""}
                        onChange={(event) =>
                          setGenderAttestations((previous) => ({
                            ...previous,
                            [entry.id]: event.target.value,
                          }))
                        }
                        disabled={!canEdit}
                        placeholder="Describe the person's explicit self-description and where you observed it."
                      />
                      <span className="field__hint">
                        Confirm explicit self-description in your own words. A
                        name, appearance, or title is not evidence. Leave gender
                        unknown when self-description is unavailable.
                      </span>
                    </label>
                  )}
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
                    disabled={!hydrated || !entry.current_revision}
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
            citationContext={draft.citationContext}
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
          kind={history.kind}
          entryId={history.id}
          revision={history.current_revision}
          canEdit={canEdit}
          onClose={() => setHistory(null)}
          onRestore={refresh}
          onStale={() => {
            setHistory(null);
            setStale(true);
            setError(
              "This entry changed before it could be restored. Compare the latest revision before trying again.",
            );
          }}
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
