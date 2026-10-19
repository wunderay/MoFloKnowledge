"use client";
import { useState } from "react";
import type { DraftEntry } from "@/contracts/api-types";
import { api, ApiError, companyPath, errorMessage, write } from "../shared/api-client";
import { Notice, StatusBadge } from "../shared/ui";
import { CATEGORY_SPECS } from "./business-fields";

type Entry = Pick<DraftEntry, "id" | "kind" | "current_revision" | "content" | "provenance" | "review_status">;
type Decision = "approved" | "rejected";

const heading = (entry: Entry) =>
  "name" in entry.content && typeof entry.content.name === "string" && entry.content.name
    ? entry.content.name
    : CATEGORY_SPECS[entry.kind].label;

/**
 * "Review changes": a saved knowledge version holds approved entries only, and every edit made in place leaves its entry
 * unreviewed. This list approves an entry for the next version, or removes it from future versions, one entry at a time or
 * every unreviewed entry at once.
 */
export function HubReview({
  companyId,
  entries,
  canEdit,
  onChanged,
}: {
  companyId: string;
  entries: Entry[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unreviewed = entries.filter((entry) => entry.review_status === "unreviewed");
  if (entries.length === 0) {
    return null;
  }

  async function decide(list: Entry[], status: Decision) {
    setBusy(true);
    setError("");
    try {
      for (const entry of list) {
        await api(
          companyPath(companyId, `/entries/${entry.id}/revisions`),
          write("POST", {
            expectedRevision: entry.current_revision,
            content: entry.content,
            provenance: entry.provenance,
            reviewStatus: status,
            reason: status === "approved" ? "Reviewer approved this entry." : "Reviewer removed this entry from future snapshots.",
            requestId: crypto.randomUUID(),
          }),
        );
      }
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 409
          ? `${heading(list[0])} changed since it was loaded. The latest draft is shown; review it again.`
          : errorMessage(failure, "The review could not be saved."),
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
        <button type="button" className="button" disabled={busy} onClick={() => void decide(unreviewed, "approved")}>
          Approve all {unreviewed.length}
        </button>
      )}
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className="knowledge-view__review-name">{heading(entry)}</span>
            <StatusBadge value={entry.review_status} />
            {canEdit && (
              <div className="actions">
                {entry.review_status !== "approved" && (
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={busy}
                    aria-label={`Approve ${heading(entry)}`}
                    onClick={() => void decide([entry], "approved")}
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
                    onClick={() => void decide([entry], "rejected")}
                  >
                    Remove from future versions
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
