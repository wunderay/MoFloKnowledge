"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ApiError, api, companyPath, write } from "../shared/api-client";
import type { ViewPerson } from "./data";

/** The reference the uploads API returns for a stored image; only these four fields are saved with the person. */
interface Stored { id: string; path: string; content_type: string; size_bytes: number }

/** Sends the file to the uploads API as a portrait and returns the stored reference. The server alone decides what is acceptable. */
async function uploadPortrait(companyId: string, file: File): Promise<Stored> {
  const form = new FormData();
  form.append("kind", "portraits");
  form.append("file", file);
  // No Content-Type header: the browser adds the multipart boundary.
  const response = await fetch(companyPath(companyId, "/uploads"), { method: "POST", body: form, cache: "no-store" });
  const body = (await response.json().catch(() => null)) as {
    data?: Stored | null;
    error?: { message?: string } | null;
  } | null;
  if (!response.ok || body?.error || !body?.data) {
    throw new ApiError(body?.error?.message ?? "The photo could not be uploaded.", response.status);
  }
  const { id, path, content_type, size_bytes } = body.data;
  return { id, path, content_type, size_bytes };
}

/** A failed request in words: the server's own message. */
const messageOf = (error: unknown) => (error as Error)?.message || "The request could not be completed.";

/**
 * The portrait file input of the selected person. It uploads the image, then saves a new revision of the
 * person that points at it; an upload the server refuses saves nothing and shows its message.
 */
export function PortraitControl({
  companyId,
  item,
  blocked,
  onSaved,
}: {
  companyId: string;
  item: ViewPerson;
  blocked: boolean;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const { person } = item;
  const label = person.portrait ? "Change portrait" : "Upload portrait";

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be chosen again after a failure.
    event.target.value = "";
    if (!file || working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const stored = await uploadPortrait(companyId, file);
      await api(
        companyPath(companyId, `/entries/${item.entryId}/revisions`),
        write("POST", {
          expectedRevision: item.revision,
          content: { ...person, portrait: stored },
          provenance: item.evidence.provenance,
          reviewStatus: "unreviewed",
          reason: "Portrait uploaded from the knowledge view.",
          requestId: crypto.randomUUID(),
        }),
      );
      await onSaved();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="knowledge-view__portrait-control">
      <label className="knowledge-view__site-add knowledge-view__portrait-pick">
        <span aria-hidden="true">{busy ? "Uploading…" : label}</span>
        <input
          className="knowledge-view__portrait-input"
          type="file"
          accept="image/*"
          aria-label={label}
          disabled={busy || blocked}
          onChange={(event) => void choose(event)}
        />
      </label>
      {error && <p className="knowledge-view__dialog-error" role="alert">{error}</p>}
    </div>
  );
}

/** The confirmation dialog: mounted only while open, so every opening starts without a message. */
function ConfirmDelete({
  companyId,
  item,
  title,
  onClose,
  onDeleted,
}: {
  companyId: string;
  item: ViewPerson;
  title: string;
  onClose: () => void;
  /** Runs once the server removed the person; it reloads the draft and moves the selection. */
  onDeleted: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  // One request id per opening: a retry after a lost answer repeats the same request, which the server answers once.
  const [requestId] = useState(() => crypto.randomUUID());

  // A native modal dialog takes focus, traps it and makes the page behind it inert.
  const modal = useCallback((element: HTMLDialogElement | null) => {
    if (element && !element.open) {
      element.showModal();
    }
  }, []);

  function close() {
    if (!deleting.current) {
      onClose();
    }
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    close();
  }
  async function confirm() {
    if (deleting.current) {
      return;
    }
    deleting.current = true;
    setBusy(true);
    setError("");
    try {
      await api(companyPath(companyId, `/entries/${item.entryId}`), write("DELETE", { expectedRevision: item.revision, requestId }));
    } catch (failure) {
      deleting.current = false;
      setBusy(false);
      setError(messageOf(failure));
      return;
    }
    // The person is gone; whatever the reload finds, the dialog's job is done.
    try {
      await onDeleted();
    } finally {
      deleting.current = false;
      onClose();
    }
  }

  return (
    <dialog
      ref={modal}
      className="knowledge-view__dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Delete ${title}`}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={(event) => {
        // The browser can close a modal without a cancel event; keep it open while the request runs.
        const element = event.currentTarget;
        if (deleting.current) {
          if (!element.open) {
            element.showModal();
          }
        } else {
          onClose();
        }
      }}
    >
      <div className="knowledge-view__dialog-body">
        <h2 className="knowledge-view__dialog-title">Delete {title}?</h2>
        <p className="knowledge-view__dialog-hint">
          They leave the list, your next saved version and every export. Earlier saved versions keep them.
        </p>
        {error && <p className="knowledge-view__dialog-error" role="alert">{error}</p>}
        <div className="knowledge-view__dialog-actions">
          <button type="button" className="knowledge-view__site-add" onClick={close} disabled={busy} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="knowledge-view__site-import knowledge-view__danger"
            onClick={() => void confirm()}
            disabled={busy}
            aria-busy={busy}
          >
            Delete
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** "Delete <name>" for the selected person, and the dialog that confirms it. */
export function DeletePerson({
  companyId,
  item,
  title,
  blocked,
  onDeleted,
}: {
  companyId: string;
  item: ViewPerson;
  title: string;
  blocked: boolean;
  onDeleted: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Whenever the dialog closes, focus goes back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && !open) {
      button.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="knowledge-view__site-add knowledge-view__danger"
        aria-label={`Delete ${title}`}
        disabled={blocked}
        title={blocked ? "Reload to see the latest changes before deleting." : undefined}
        onClick={() => { setOpen(true); }}
      >
        Delete
      </button>
      {open && (
        <ConfirmDelete companyId={companyId} item={item} title={title} onClose={() => { setOpen(false); }} onDeleted={onDeleted} />
      )}
    </>
  );
}
