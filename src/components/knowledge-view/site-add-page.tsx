"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SiteLink } from "@/contracts";
import { MAX_TEXT_LENGTH, URLSchema } from "@/contracts/primitives";
import type { ViewSiteLinks } from "./data";
import { errorText, fullText, importRoom, saveLinks } from "./site-import";

const NO_WEBSITE = "Add the company website first.";
const NOTE = "Page added from the knowledge view.";

/** A host without its leading "www.", in lower case (URL already lower-cases it). */
const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The company's host from its website, or null when it has no usable website. */
export function companyHost(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return bareHost(new URL(website.trim()).hostname) || null;
  } catch {
    return null;
  }
}

/** The address with its hash and trailing slashes dropped, so "/visit/#map" and "/visit" are one page; the query stays. */
function pageKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

export type PageCheck = { ok: true; url: string; title: string } | { ok: false; message: string };

/**
 * Checks what was typed, in this order: an address, an http(s) scheme, a usable address (no login in it),
 * the company's own site, a page not listed yet. The first failure is the one message to show.
 */
export function checkPage(input: { url: string; title: string }, links: SiteLink[], website: string | null | undefined): PageCheck {
  const typed = input.url.trim();
  if (!typed) return { ok: false, message: "Enter the page URL." };
  if (!/^https?:\/\//i.test(typed))
    return { ok: false, message: "Start the address with https:// (or http://), for example https://www.example.com/page." };
  let parsed: URL;
  try {
    parsed = new URL(typed);
  } catch {
    return { ok: false, message: "That does not look like a web address. Check it and try again." };
  }
  if (parsed.username || parsed.password)
    return { ok: false, message: "Remove the username and password from the address and try again." };
  if (!URLSchema.safeParse(parsed.href).success)
    return { ok: false, message: "That address cannot be used. Check it and try again." };
  const company = companyHost(website);
  if (!company) return { ok: false, message: NO_WEBSITE };
  const host = bareHost(parsed.hostname);
  if (host !== company && !host.endsWith(`.${company}`)) return { ok: false, message: `Use a page on ${company}.` };
  const key = pageKey(parsed.href);
  const existing = links.find((link) => pageKey(link.url) === key);
  if (existing) return { ok: false, message: `"${existing.title.trim() || existing.url}" is already in the list.` };
  // A longer title would have to be cut to fit; say so instead of saving something else than was typed.
  const name = input.title.trim();
  if (name.length > MAX_TEXT_LENGTH)
    return { ok: false, message: `Keep the title to ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.` };
  return { ok: true, url: parsed.href, title: name || parsed.href };
}

/** "+ Add page" and the dialog that adds one page to the Site Knowledge list. */
export function SiteAddPage({
  companyId,
  actorId,
  site,
  website,
  blocked = false,
  onSaved,
}: {
  companyId: string;
  actorId: string;
  site: ViewSiteLinks;
  /** The Company Foundation website; pages must be on its site. */
  website: string | null;
  /** An earlier save went through but the view could not be refreshed: no new page until it is. */
  blocked?: boolean;
  /** Reloads the draft after a save. It resolves once the save is committed, even if the reload failed. */
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Whenever the dialog closes, focus goes back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="knowledge-view__site-add"
        onClick={() => setOpen(true)}
        disabled={blocked}
        title={blocked ? "Reload to see the latest links before adding another page." : undefined}
      >
        + Add page
      </button>
      {open && (
        <AddPageDialog
          companyId={companyId}
          actorId={actorId}
          site={site}
          website={website}
          onSaved={onSaved}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Mounted only while open, so every opening starts with empty fields and no message. */
function AddPageDialog({
  companyId,
  actorId,
  site,
  website,
  onSaved,
  onClose,
}: {
  companyId: string;
  actorId: string;
  site: ViewSiteLinks;
  website: string | null;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const field = useRef<HTMLInputElement>(null);

  // A native modal dialog takes focus, traps it and makes the page behind it inert.
  const modal = useCallback((element: HTMLDialogElement | null) => {
    if (element && !element.open) element.showModal();
  }, []);
  // Focus the address on opening and again once a save has ended (the fields are disabled while it runs).
  useEffect(() => {
    if (!busy) field.current?.focus();
  }, [busy]);

  const { room, limit } = importRoom(site);
  // Why nothing can be saved, shown from the start; otherwise the message of the last failed attempt.
  const blocker = !companyHost(website) ? NO_WEBSITE : room === 0 ? fullText(limit) : "";
  const message = blocker || error;

  function close() {
    if (!saving.current) onClose();
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || blocker) return;
    const checked = checkPage({ url, title }, site.links, website);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await saveLinks(companyId, actorId, site, [{ key: checked.url, label: checked.title, url: checked.url }], NOTE);
      await onSaved();
      saving.current = false;
      onClose();
    } catch (failure) {
      saving.current = false;
      setBusy(false);
      setError(errorText(failure, "add the page again"));
    }
  }

  return (
    <dialog
      ref={modal}
      className="knowledge-view__dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Add page"
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={(event) => {
        // The browser can close a modal without a cancel event (Escape pressed twice). Closing is the
        // normal close, except during a save: the dialog is shown again so a failure is always visible.
        const element = event.currentTarget;
        if (saving.current) {
          if (!element.open) element.showModal();
        } else onClose();
      }}
    >
      <form onSubmit={submit} noValidate>
        <h2 className="knowledge-view__dialog-title">Add page</h2>
        <p className="knowledge-view__dialog-hint">
          Add a page from the company&apos;s own site to the list of places your content can link to.
        </p>
        <label className="knowledge-view__dialog-field">
          <span className="knowledge-view__dialog-label">Page URL</span>
          <input
            ref={field}
            className="knowledge-view__dialog-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://"
            required
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label className="knowledge-view__dialog-field">
          <span className="knowledge-view__dialog-label">Title (optional)</span>
          <input
            className="knowledge-view__dialog-input"
            type="text"
            autoComplete="off"
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {message && <p className="knowledge-view__dialog-error" role="alert">{message}</p>}
        <div className="knowledge-view__dialog-actions">
          <button type="button" className="knowledge-view__site-add" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="knowledge-view__site-import" disabled={busy || !!blocker} aria-busy={busy}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
