"use client";
import { useState } from "react";
import type { DraftEntry } from "@/contracts/api-types";
import { entryBusiness, type BusinessEntry, type CandidateConflict, type EntryProvenance } from "@/contracts";
import { applyConflictDecision, unresolvedConflicts } from "@/knowledge/conflict-decisions";
import { api, ApiError, companyPath, errorMessage, write } from "../shared/api-client";
import { Notice, StatusBadge } from "../shared/ui";
import { CATEGORY_SPECS, labelOf, summarizeValue } from "./business-fields";

type Entry = Pick<DraftEntry, "id" | "kind" | "current_revision" | "content" | "provenance" | "review_status">;
type Decision = "approved" | "rejected";
/** An entry as it will be sent: the stored one, or the stored one with the conflict choices made here applied. */
interface Decided { content: BusinessEntry; provenance: EntryProvenance }

const heading = (entry: Entry) =>
  "name" in entry.content && typeof entry.content.name === "string" && entry.content.name
    ? entry.content.name
    : CATEGORY_SPECS[entry.kind].label;

/** The entry's content with one conflict decided: the chosen candidate's value (or no value) put in place, and the decision recorded. */
function decide(entry: Entry, current: Decided, conflict: CandidateConflict, candidateId: string | null, actorId: string): Decided {
  const { business, decision } = applyConflictDecision(entryBusiness(entry.kind, current.content), conflict, {
    id: crypto.randomUUID(),
    conflict_id: conflict.id,
    target: conflict.target,
    action: candidateId ? "select" : "clear",
    candidate_id: candidateId,
    actor_id: actorId,
    decided_at: new Date().toISOString(),
    note: candidateId ? "Reviewer selected this source candidate." : "Reviewer cleared the disputed value.",
  });
  const content =
    entry.kind === "key_person"
      ? (business.key_people as BusinessEntry[])[0]
      : entry.kind === "offering"
        ? (business.offerings as BusinessEntry[])[0]
        : (business[entry.kind] as BusinessEntry);
  return { content, provenance: { ...current.provenance, decisions: [...current.provenance.decisions, decision] } };
}

/**
 * "Review changes": a saved knowledge version holds approved entries only, and every edit made in place leaves its entry
 * unreviewed. This list approves an entry for the next version, or removes it from future versions, one entry at a time or
 * every unreviewed entry at once. Where the sources disagree on a value that matters (a material conflict), the reviewer
 * picks a source's value, or clears it, before the entry can be approved.
 */
export function HubReview({
  companyId,
  actorId,
  entries,
  canEdit,
  onChanged,
}: {
  companyId: string;
  actorId: string;
  entries: Entry[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Conflict choices made here, by entry id, until the entry is approved. */
  const [decided, setDecided] = useState<Record<string, Decided>>({});
  if (entries.length === 0) {
    return null;
  }
  const current = (entry: Entry): Decided => decided[entry.id] ?? { content: entry.content, provenance: entry.provenance };
  const open = (entry: Entry) => {
    const { provenance } = current(entry);
    return unresolvedConflicts(provenance.conflicts, provenance.decisions);
  };
  const unreviewed = entries.filter((entry) => entry.review_status === "unreviewed");
  const blocked = unreviewed.filter((entry) => open(entry).length > 0);

  function choose(entry: Entry, conflict: CandidateConflict, candidateId: string | null) {
    setError("");
    try {
      const next = decide(entry, current(entry), conflict, candidateId, actorId);
      setDecided((previous) => ({ ...previous, [entry.id]: next }));
    } catch (failure) {
      setError(errorMessage(failure, "That choice could not be applied."));
    }
  }

  async function review(list: Entry[], status: Decision) {
    setBusy(true);
    setError("");
    let at: Entry | undefined;
    try {
      for (const entry of list) {
        at = entry;
        const { content, provenance } = current(entry);
        await api(
          companyPath(companyId, `/entries/${entry.id}/revisions`),
          write("POST", {
            expectedRevision: entry.current_revision,
            content,
            provenance,
            reviewStatus: status,
            reason: status === "approved" ? "Reviewer approved this entry." : "Reviewer removed this entry from future snapshots.",
            requestId: crypto.randomUUID(),
          }),
        );
        setDecided(({ [entry.id]: _sent, ...rest }) => rest);
      }
    } catch (failure) {
      const name = at ? heading(at) : "An entry";
      setError(
        failure instanceof ApiError && failure.status === 409
          ? `${name} changed since it was loaded. The latest draft is shown; review it again.`
          : `${name}: ${errorMessage(failure, "the review could not be saved.")}`,
      );
    } finally {
      await onChanged();
      setBusy(false);
    }
  }

  return (
    <details className="knowledge-view__review hub-review" open={unreviewed.length > 0}>
      <summary>
        Review changes{unreviewed.length > 0 ? ` (${unreviewed.length} to review)` : ""}
      </summary>
      <p className="muted">
        A knowledge version saves approved entries. Edits leave an entry to review again.
      </p>
      {error && <Notice error>{error}</Notice>}
      {canEdit && unreviewed.length > 1 && (
        <button
          type="button"
          className="button"
          disabled={busy || blocked.length > 0}
          onClick={() => void review(unreviewed, "approved")}
        >
          Approve all {unreviewed.length}
        </button>
      )}
      {canEdit && unreviewed.length > 1 && blocked.length > 0 && (
        <p className="muted">Choose a value for every conflict below before approving all.</p>
      )}
      <ul>
        {entries.map((entry) => {
          const conflicts = open(entry);
          return (
            <li key={entry.id}>
              <span className="knowledge-view__review-name">{heading(entry)}</span>
              <StatusBadge value={entry.review_status} />
              {conflicts.length > 0 && (
                <div className="hub-review__conflicts">
                  <p>
                    The sources disagree on {conflicts.length === 1 ? "one value" : `${conflicts.length} values`}. Choose one, or clear
                    it, before approving.
                  </p>
                  {conflicts.map((conflict) => {
                    const field = labelOf(conflict.target.split("/").at(-1) ?? "Field");
                    return (
                      <fieldset key={conflict.id} className="hub-review__conflict">
                        <legend>{field}</legend>
                        {conflict.candidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className="button button--quiet"
                            disabled={!canEdit || busy}
                            onClick={() => { choose(entry, conflict, candidate.id); }}
                          >
                            {`Use “${summarizeValue(candidate.value)}”`}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="button button--quiet"
                          disabled={!canEdit || busy}
                          aria-label={`Clear ${field}`}
                          onClick={() => { choose(entry, conflict, null); }}
                        >
                          Clear the value
                        </button>
                      </fieldset>
                    );
                  })}
                </div>
              )}
              {canEdit && (
                <div className="actions">
                  {entry.review_status !== "approved" && (
                    <button
                      type="button"
                      className="button button--quiet"
                      disabled={busy || conflicts.length > 0}
                      title={conflicts.length > 0 ? "Choose a value for each conflict first." : undefined}
                      aria-label={`Approve ${heading(entry)}`}
                      onClick={() => void review([entry], "approved")}
                    >
                      Approve
                    </button>
                  )}
                  {entry.review_status !== "rejected" && (
                    <button
                      type="button"
                      className="button button--quiet button--danger"
                      disabled={busy}
                      aria-label={`Remove ${heading(entry)} from future versions`}
                      onClick={() => void review([entry], "rejected")}
                    >
                      Remove from future versions
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
