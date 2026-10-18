"use client";
import Link from "next/link";
import { ArrowUpRight } from "../shared/icons";
import "./knowledge-editor.css";
import { ZodError } from "zod";
import { useUnsavedNavigation } from "./unsaved-navigation";
import { ValueView } from "./entry-value";
import { CitationPopover } from "../shared/citation-popover";
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
import { api, ApiError, companyPath, write } from "../shared/api-client";
import { CATEGORY_SPECS, labelOf, summarizeValue } from "./business-fields";
import { BusinessField } from "./business-form";
import { EmptyState, Notice, StatusBadge, useHydrated } from "../shared/ui";
import { ScrapeProgress } from "./scrape-progress";
import { EntryHistory } from "./entry-history";
import { PublicationDialog } from "./publication-dialog";
import { CompanySettings } from "./company-settings";
import { ProposalReview } from "./proposal-review";
const VIEW_SPECS = {
  company_foundation: { label: "General Info", description: "The essential facts, locations, and background of your company." },
  offering: { label: "Business Offerings", description: "Products and services, with their own features, pricing, and approval." },
  positioning: { label: "Sales & Marketing", description: "Your company story, social presence, and paths to customers." },
  market_and_customers: { label: "Customers & Industry", description: "Who you serve, the industries they work in, and what they need." },
  branding_and_style: { label: "Branding & Style", description: CATEGORY_SPECS.branding_and_style!.description },
  key_person: { label: "Key People", description: CATEGORY_SPECS.key_person!.description },
  site_links: { label: "Site links", description: CATEGORY_SPECS.site_links!.description },
};
const MARKETING_FIELDS = new Set(["channels", "funnels", "ctas"]);
const SHARED_CUSTOMER_FIELDS = new Set(["target_buyers", "customer_needs", "ideal_customer_personas"]);
function viewCategory(category: EntryKind): keyof typeof VIEW_SPECS {
  return category === "online_presence" ? "positioning" : category;
}
function entryFields(kind: EntryKind, marketing: boolean) {
  return Object.entries(CATEGORY_SPECS[kind]!.fields).filter(([key]) =>
    kind !== "market_and_customers" || (marketing
      ? MARKETING_FIELDS.has(key) || SHARED_CUSTOMER_FIELDS.has(key)
      : !MARKETING_FIELDS.has(key)),
  );
}
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
  const [selectedOffering, setSelectedOffering] = useState<string | null>(null);
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
    const entryId = new URLSearchParams(window.location.search).get("entryId");
    if (entryId) setSelectedOffering(entryId);
  }, []);
  useEffect(() => {
    if (!initialDraft) refresh();
    api<{ companies: { id: string; name: string }[] }>("/api/companies")
      .then((data) => setCompanies(data.companies))
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    const entryId = new URLSearchParams(window.location.search).get("entryId");
    if (entryId && draft) {
      document
        .getElementById(`entry-${entryId}`)
        ?.scrollIntoView({ block: "center" });
    }
  }, [draft, state.category, selectedOffering]);
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
  const currentView = viewCategory(state.category);
  const view = VIEW_SPECS[currentView];
  const marketing = currentView === "positioning";
  const kinds: EntryKind[] = marketing
    ? ["online_presence", "positioning", "market_and_customers"]
    : [currentView];
  const visibleEntries = kinds.flatMap((kind): Entry[] => {
    const group = draft.entries.filter((entry) => entry.kind === kind);
    if (group.length) return group;
    if (kind === "key_person" || kind === "offering") return [];
    return [{
      id: `new-${kind}`, kind, current_revision: 0,
      content: createEntryDefault(kind), provenance: createEmptyProvenance(),
      review_status: "unreviewed",
    }];
  });
  const activeOffering = visibleEntries.find((entry) => entry.id === selectedOffering)
    ?? visibleEntries[0];
  const renderedEntries = currentView === "offering"
    ? visibleEntries.filter((entry) => entry.id === activeOffering?.id)
    : visibleEntries;
  const foundationEntry = draft.entries.find((entry) => entry.kind === "company_foundation");
  const foundation = foundationEntry
    ? (state.values[foundationEntry.id] ?? foundationEntry.content) as Record<string, unknown>
    : (state.values["new-company_foundation"] ?? {}) as Record<string, unknown>;
  const employeeCount = foundation.employee_count as { raw?: string; exact?: number; min?: number; max?: number } | null;
  const employeeLabel = employeeCount?.raw || (employeeCount?.exact != null
    ? String(employeeCount.exact)
    : employeeCount?.min != null && employeeCount?.max != null
      ? `${employeeCount.min}–${employeeCount.max}`
      : employeeCount?.min != null ? `${employeeCount.min}+`
      : employeeCount?.max != null ? `Up to ${employeeCount.max}` : "Unknown");
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
      if (entry.kind === "offering" && isNew)
        setSelectedOffering(result.entry_id ?? result.id ?? entry.id);
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
    if (entry.kind === "offering") setSelectedOffering(id);
  }
  return (
    <div className="knowledge-editor cloud-knowledge">
      {!membershipCanEdit && (
        <Notice>
          {draft.company.archived_at
            ? "This company is archived. Saved knowledge and history remain available."
            : "You have viewer access. You can inspect evidence and download saved versions."}
        </Notice>
      )}
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
      <nav className="cloud-knowledge__navigation" aria-label="Knowledge categories">
        <div className="cloud-knowledge__navigation-context"><span className="cloud-knowledge__tab" aria-current="page">Company</span><span className="cloud-knowledge__company-name">{draft.company.name}</span></div>
        <div className="cloud-knowledge__navigation-actions">
          <Link href={`/knowledge/view?companyId=${companyId}`} className="cloud-knowledge__site-link">Site Knowledge <ArrowUpRight /></Link>
          <select
            className="cloud-knowledge__category-select"
            aria-label="Knowledge category"
            value={currentView}
            disabled={!hydrated}
            onChange={(event) => changeCategory(event.target.value as EntryKind)}
          >
            {Object.entries(VIEW_SPECS).map(([kind, category]) => (
              <option key={kind} value={kind}>{category.label}</option>
            ))}
          </select>
        </div>
      </nav>
      <div className={`cloud-knowledge__card cloud-knowledge__card--${currentView}`}>
        <section className="knowledge-editor__content">
          {currentView === "company_foundation" && (
            <div className="cloud-knowledge__banner">
              <div><span className="cloud-knowledge__banner-label">Company overview</span><h3>{draft.company.name}</h3></div>
              <dl className="cloud-knowledge__stats">
                <div><dt>Founded</dt><dd>{String(foundation.year_founded ?? "Unknown")}</dd></div>
                <div><dt>Employees</dt><dd>{employeeLabel}</dd></div>
                <div><dt>Legal entity</dt><dd>{String(foundation.legal_entity_type ?? "Unknown")}</dd></div>
              </dl>
            </div>
          )}
          <div className="knowledge-editor__header">
            <div className="section-heading">
              <h2>{view.label}</h2>
              {canEdit && ["key_person", "offering"].includes(currentView) && (
                <button className="button" onClick={addRepeatable}>
                  ＋ Add {currentView === "key_person" ? "person" : "offering"}
                </button>
              )}
            </div>
            <p>{view.description}</p>
            <div className="cloud-knowledge__coverage" aria-label="Review coverage">
              {kinds.map((kind) => {
                const group = draft.entries.filter((entry) => entry.kind === kind);
                const coverage = group.flatMap((entry) => (state.provenance[entry.id] ?? entry.provenance).coverage);
                const assessed = coverage.filter((item) => item.status !== "not_checked")
                  .reduce((total, item) => total + item.targets.length, 0);
                const fields = group.length * Object.keys(CATEGORY_SPECS[kind]!.fields).length ||
                  (["key_person", "offering"].includes(kind) ? 0 : Object.keys(CATEGORY_SPECS[kind]!.fields).length);
                return <span key={kind}>{marketing && `${CATEGORY_SPECS[kind]!.label}: `}{assessed}/{fields} fields checked · {group.filter((entry) => entry.review_status === "approved").length}/{group.length || (["key_person", "offering"].includes(kind) ? 0 : 1)} reviewed</span>;
              })}
            </div>
          </div>
          {currentView === "market_and_customers" && (
            <div className="cloud-knowledge__banner">
              <div><span className="cloud-knowledge__banner-label">Industry</span><h3>{String(foundation.industry ?? "Not recorded")}</h3></div>
              <p>Industry, business model, and company role can be edited in General Info.</p>
            </div>
          )}
          <div className="cloud-knowledge__workspace-controls" aria-label="Company workspace controls">
            <div className="cloud-knowledge__workspace-context"><Link href="/dashboard">Companies</Link><span aria-hidden="true"> / </span><span>{draft.company.name}</span></div>
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
      <div className="cloud-knowledge__draft-status">
        <span className="muted">
          Current draft · generation {draft.draftGeneration}
        </span>
        <div className="actions">
          <StatusBadge value={draft.company.role} />
          {state.dirty.length > 0 && <StatusBadge value="unsaved_changes" />}
        </div>
      </div>
          </div>
          <div className={currentView === "offering" && visibleEntries.length > 0 ? "cloud-knowledge__offerings" : "cloud-knowledge__sections"}>
            {currentView === "offering" && visibleEntries.length > 0 && (
              <nav className="cloud-knowledge__offering-list" aria-label="Business offerings">
                <p className="cloud-knowledge__list-label">Your offerings <span>{visibleEntries.length}</span></p>
                {visibleEntries.map((entry, index) => {
                  const value = state.values[entry.id] ?? entry.content;
                  return <button
                    key={entry.id} type="button"
                    className={`cloud-knowledge__offering${activeOffering?.id === entry.id ? " cloud-knowledge__offering--selected" : ""}`}
                    aria-current={activeOffering?.id === entry.id ? "true" : undefined}
                    onClick={() => setSelectedOffering(entry.id)}
                  >
                    <span className="cloud-knowledge__offering-icon" aria-hidden="true">▱</span>
                    <span><strong>{"name" in value && value.name ? String(value.name) : `Untitled offering ${index + 1}`}</strong><small>{state.dirty.includes(entry.id) ? "Unsaved changes" : entry.review_status.replaceAll("_", " ")}</small></span>
                    <span aria-hidden="true">›</span>
                  </button>;
                })}
              </nav>
            )}
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
          {renderedEntries.map((entry) => {
            const spec = CATEGORY_SPECS[entry.kind]!;
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
                className={`knowledge-editor__entry cloud-knowledge__entry cloud-knowledge__entry--${entry.kind}`}
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
                {entry.kind === "market_and_customers" && (
                  <p className="cloud-knowledge__save-scope">These controls save and review the full Market & customers entry, including fields in both Customers & Industry and Sales & Marketing.</p>
                )}
                <div className="cloud-knowledge__field-grid">
                  {entryFields(entry.kind, marketing).map(([key, field]) => (
                    <div className={`cloud-knowledge__field-card cloud-knowledge__field-card--${key}`} key={key}>
                    <BusinessField
                      key={key}
                      spec={key === "main_address" ? { ...field, label: "Headquarters" } : key === "alternative_company_names" ? { ...field, label: "Alternate names" } : field}
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
                    </div>
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
          </div>
          <ProposalReview
            citationContext={draft.citationContext}
            companyId={companyId}
            entries={draft.entries}
            canEdit={canEdit}
            onApplied={refresh}
          />
        </section>
      </div>
      <p className="cloud-knowledge__tip"><span aria-hidden="true">ⓘ</span> Helpful tip: Keep company facts specific and evidence based. Review sources before approving, and leave unknown values empty.</p>
      <div className="cloud-knowledge__capture">
        <h2>Website capture</h2>
        <p className="muted">Add fresh source material and review proposed changes.</p>
      <ScrapeProgress
        companyId={companyId}
        website={draft.company.website_url}
        canEdit={canEdit}
        onComplete={refresh}
      />
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
