"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, companyPath, write } from "./api-client";
import { Dialog, Notice } from "./ui";
type Preview = {
  draftGeneration: number;
  payloadPreview: unknown;
  blockingEntries: { entry_id: string; reason: string }[];
  approvedCount: number;
  rejectedCount: number;
  unresolvedCount: number;
};
export function PublicationDialog({
  companyId,
  onClose,
  onSaved,
}: {
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{
    versionId: string;
    version: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  function load() {
    setPreview(null);
    setError("");
    api<Preview>(companyPath(companyId, "/preview"))
      .then(setPreview)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [companyId]);
  async function publish() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ versionId: string; version: number }>(
        companyPath(companyId, "/versions"),
        write("POST", {
          expectedGeneration: preview.draftGeneration,
          requestId,
        }),
      );
      setSaved(result);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        saved ? `Version ${saved.version} saved` : "Save knowledge base version"
      }
      onClose={onClose}
    >
      {saved ? (
        <>
          <Notice>
            This snapshot is permanent. Future edits and scrapes will not change
            it.
          </Notice>
          <div className="actions">
            <a
              className="button button--primary"
              href={companyPath(
                companyId,
                `/versions/${saved.versionId}/download`,
              )}
            >
              Download JSON ↓
            </a>
            <Link
              className="button"
              href={`/knowledge/view?companyId=${companyId}&versionId=${saved.versionId}`}
            >
              View saved version
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Save an immutable snapshot of approved knowledge. Rejected entries
            are excluded; unknown fields retain their defaults.
          </p>
          {error && (
            <Notice error>
              {error}
              <button className="button" onClick={load}>
                Refresh preview
              </button>
            </Notice>
          )}
          {!preview && !error && (
            <Notice>Preparing an exact server preview…</Notice>
          )}
          {preview && (
            <>
              <p className="field__hint">
                Draft generation {preview.draftGeneration}
              </p>
              <div className="summary-grid">
                <div className="summary-card">
                  <div>
                    <p>Approved entries</p>
                    <strong>{preview.approvedCount}</strong>
                  </div>
                </div>
                <div className="summary-card">
                  <div>
                    <p>Rejected entries</p>
                    <strong>{preview.rejectedCount}</strong>
                  </div>
                </div>
                <div className="summary-card">
                  <div>
                    <p>Needs review</p>
                    <strong>{preview.unresolvedCount}</strong>
                  </div>
                </div>
              </div>
              {preview.blockingEntries.length > 0 ||
              preview.approvedCount === 0 ? (
                <Notice error>
                  {preview.blockingEntries.length} entries need review before
                  this version can be saved.
                  <ul>
                    {preview.blockingEntries.map((item, i) => (
                      <li key={i}>
                        {typeof item === "string" ? item : JSON.stringify(item)}
                      </li>
                    ))}
                  </ul>
                </Notice>
              ) : (
                <Notice>
                  All entries are resolved. This preview is ready to save.
                </Notice>
              )}
              <details open>
                <summary>JSON preview</summary>
                <pre className="version-viewer__json">
                  {JSON.stringify(preview.payloadPreview, null, 2)}
                </pre>
              </details>
              <div className="actions">
                <button
                  className="button button--primary"
                  disabled={
                    busy ||
                    preview.blockingEntries.length > 0 ||
                    preview.approvedCount === 0
                  }
                  onClick={publish}
                >
                  {busy ? "Saving version…" : "Save this version"}
                </button>
                <button className="button" onClick={onClose}>
                  Keep reviewing
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
