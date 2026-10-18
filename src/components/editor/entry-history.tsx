"use client";
import { useEffect, useState } from "react";
import { api, ApiError, companyPath, write } from "../shared/api-client";
import { Dialog, Notice, StatusBadge } from "../shared/ui";
import { readCitationContext } from "../shared/citation-context";
import { ValueView } from "./entry-value";
import { EntryProvenanceSchema, entryRoot, type EntryKind } from "@/contracts";
export function EntryHistory({
  companyId,
  kind,
  entryId,
  revision,
  canEdit,
  onClose,
  onRestore,
  onStale,
}: {
  companyId: string;
  kind: EntryKind;
  entryId: string;
  revision: number;
  canEdit: boolean;
  onClose: () => void;
  onRestore: () => void;
  onStale: () => void;
}) {
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Record<string, unknown>[] | { revisions: Record<string, unknown>[] }>(
      companyPath(companyId, `/entries/${entryId}/history`),
    )
      .then((data) => { setHistory(Array.isArray(data) ? data : data.revisions); })
      .catch((e) => { setError(e.message); });
  }, [companyId, entryId]);
  async function restore(fromRevision: number) {
    setBusy(true);
    try {
      await api(
        companyPath(companyId, `/entries/${entryId}/revert`),
        write("POST", {
          fromRevision,
          expectedRevision: revision,
          requestId: crypto.randomUUID(),
        }),
      );
      onRestore();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onStale();
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Entry history" onClose={onClose}>
      <p className="muted">
        Revisions are permanent. Restoring creates a new unreviewed draft.
      </p>
      {error && <Notice error>{error}</Notice>}
      {history.length === 0 && !error && <Notice>Loading revisions…</Notice>}
      {history.map((item) => (
        <div className="history__item" key={Number(item.revision)}>
          <div className="section-heading">
            <strong>Revision {Number(item.revision)}</strong>
            <StatusBadge value={String(item.review_status)} />
          </div>
          <p className="field__hint">
            {String(item.created_at)} · {String(item.author_id)}
          </p>
          {item.change_reason ? <p>{String(item.change_reason)}</p> : null}
          <details>
            <summary className="field__hint">View saved values</summary>
            {EntryProvenanceSchema.safeParse(item.provenance).success ? (
              <ValueView
                citationContext={readCitationContext(item.citationContext)}
                value={item.content}
                path={entryRoot(kind, entryId)}
                provenance={EntryProvenanceSchema.parse(item.provenance)}
                approved={item.review_status === "approved"}
              />
            ) : (
              <Notice>Evidence is unavailable for this saved revision.</Notice>
            )}
          </details>
          {canEdit && Number(item.revision) !== revision && (
            <button
              className="button"
              disabled={busy}
              onClick={() => restore(Number(item.revision))}
            >
              Restore as new draft
            </button>
          )}
        </div>
      ))}
    </Dialog>
  );
}
