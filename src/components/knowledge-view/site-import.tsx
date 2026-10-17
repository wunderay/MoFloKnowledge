"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { parseBusinessEntry, type SiteLink } from "@/contracts";
import { MAX_TEXT_LENGTH, URLSchema } from "@/contracts/primitives";
import type { SourceCoverage } from "@/contracts/source-coverage";
import { MAX_CLAIM_TARGETS, MAX_ENTRY_CLAIMS, MAX_ENTRY_OPERATIONS, OPERATIONS_PER_SAVE } from "@/knowledge/revise-provenance";
import { ApiError, api, companyPath } from "../api-client";
import type { ViewSiteLinks } from "./data";
import { prepareEntrySave, sendEntrySave } from "./save-entry";

/** The most links one site_links entry can hold. */
export const MAX_LINKS = 500;
/**
 * How many more links an import may add, and why not more. The links themselves are capped at
 * MAX_LINKS. The save also writes provenance, which the API caps separately, and the server (not this
 * browser) builds it: reviseProvenance names the new values (two per link: title and address) in
 * shared claims, so a save adds claimsForLeaves(2 * links) claims (see groupClaims) and OPERATIONS_PER_SAVE operations. Room is what
 * both the link cap and the claims and operations still free allow.
 */
export function importRoom(site: ViewSiteLinks): { room: number; limit: "links" | "claims" | "operations" | null } {
  const linkRoom = Math.max(0, MAX_LINKS - site.links.length);
  const provenance = site.entry?.provenance;
  const claimRoom = MAX_ENTRY_CLAIMS - (provenance?.claims.length ?? 0);
  // The most links k with claimsForLeaves(LEAVES_PER_LINK * k) <= claimRoom.
  const byClaims = claimRoom <= 0 ? 0 : Math.floor((claimRoom * MAX_CLAIM_TARGETS) / LEAVES_PER_LINK);
  if (provenance && provenance.operations.length + OPERATIONS_PER_SAVE > MAX_ENTRY_OPERATIONS) return { room: 0, limit: "operations" };
  if (byClaims < linkRoom) return { room: byClaims, limit: "claims" };
  return { room: linkRoom, limit: linkRoom === 0 ? "links" : null };
}
/** A new link names its title and its address; its note is empty. */
const LEAVES_PER_LINK = 2;

export type Candidate = { key: string; label: string; url: string };
/** The address with its hash and trailing slashes dropped, so "/visit/#map" and "/visit" are one page; the query stays. */
export function pageKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

/**
 * The captured pages that can become links: plain http(s) addresses without credentials that are
 * not stored links yet, each address once, in the inventory's order.
 */
export function importCandidates(pages: SourceCoverage["pages"], stored: SiteLink[]): Candidate[] {
  const seen = new Set(stored.map((link) => pageKey(link.url)));
  const out: Candidate[] = [];
  for (const page of pages) {
    if (page.state !== "captured" || !URLSchema.safeParse(page.url).success) continue;
    const key = pageKey(page.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: page.title?.trim() || page.url, url: page.url });
  }
  return out;
}

/** Why no more pages fit, in words: the links are at their maximum, or the provenance records are full. */
export function fullText(limit: "links" | "claims" | "operations" | null): string {
  return limit === "claims" || limit === "operations"
    ? `The list's source records are full (the maximum of ${limit === "claims" ? MAX_ENTRY_CLAIMS + " source claims" : MAX_ENTRY_OPERATIONS + " recorded changes"}), so no more pages can be added here.`
    : `The list already has the maximum of ${MAX_LINKS} links, so no more pages can be added.`;
}

/** The reason recorded with an import's revision. */
const IMPORT_NOTE = "Pages imported from the website crawl.";

/**
 * Saves `added` after the stored links, the way the editor saves an entry: a new entry or a new revision.
 * `note` is the reason recorded with the change.
 */
export async function saveLinks(
  companyId: string,
  actorId: string,
  site: ViewSiteLinks,
  added: Candidate[],
  note: string = IMPORT_NOTE,
) {
  const links = [
    ...site.links,
    ...added.map((page) => ({ id: crypto.randomUUID(), title: page.label.slice(0, MAX_TEXT_LENGTH), url: page.url, note: null })),
  ];
  const content = parseBusinessEntry("site_links", { links });
  await sendEntrySave(
    prepareEntrySave({ companyId, actorId, kind: "site_links", entry: site.entry, content, note }),
  );
}

/** A failed save in words; `again` finishes the sentence for a list that changed ("import again"). */
export const errorText = (error: unknown, again = "import again") =>
  error instanceof ApiError && error.status === 409
    ? `This list changed since the page was loaded. Reload the page to get the latest links, then ${again}.`
    : error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join("; ")
      : (error as Error).message;

/** "Import from website" and the dialog that lists the captured pages that are not links yet. */
export function SiteImport({
  companyId,
  actorId,
  site,
  blocked = false,
  onSaved,
}: {
  companyId: string;
  actorId: string;
  site: ViewSiteLinks;
  /** An earlier import was saved but the view could not be refreshed: no new import until it is. */
  blocked?: boolean;
  /** Reloads the draft after a save so the card shows the new links. It resolves once the save is committed, even if the reload failed. */
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<SourceCoverage["pages"] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  // The native dialog is modal: it takes focus, traps it, and returns it to the button when it closes.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setPages(null);
    setLoadError("");
    api<SourceCoverage>(companyPath(companyId, "/sources"))
      .then((data) => current && setPages(data.pages))
      .catch((error: Error) => current && setLoadError(error.message));
    return () => {
      current = false;
    };
  }, [open, companyId]);

  const candidates = pages ? importCandidates(pages, site.links) : [];
  const { room: remaining, limit } = importRoom(site);
  const chosen = candidates.filter((page) => selected.includes(page.key)).slice(0, remaining);
  const full = chosen.length >= remaining;
  function show() {
    setSelected([]);
    setSaveError("");
    setOpen(true);
  }
  function close() {
    if (!saving.current) setOpen(false);
  }
  function choose(key: string, checked: boolean) {
    setSelected((now) => (checked ? (now.length >= remaining ? now : [...now.filter((k) => k !== key), key]) : now.filter((k) => k !== key)));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || chosen.length === 0) return;
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      await saveLinks(companyId, actorId, site, chosen);
      await onSaved();
      setSelected([]);
      setOpen(false);
    } catch (error) {
      setSaveError(errorText(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const limited = candidates.length > remaining;
  return (
    <>
      <button
        type="button"
        className="knowledge-view__site-import"
        onClick={show}
        disabled={blocked}
        title={blocked ? "Reload to see the latest links before importing again." : undefined}
      >
        Import from website
      </button>
      <dialog
        ref={dialog}
        className="knowledge-view__dialog"
        aria-label="Import pages from website"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
      >
        {open && (
          <form onSubmit={submit}>
            <h2 className="knowledge-view__dialog-title">Import pages from website</h2>
            <p className="knowledge-view__dialog-hint">
              Pages from the latest crawl that are not in the list yet. Each one is added with its page title and address.
            </p>
            {loadError ? (
              <p className="knowledge-view__dialog-error" role="alert">{loadError}</p>
            ) : pages === null ? (
              <p className="knowledge-view__dialog-hint" role="status">Loading captured pages…</p>
            ) : candidates.length === 0 ? (
              <p className="knowledge-view__dialog-hint">
                No new pages to add. Every captured page is already in the list, or none were captured yet.
              </p>
            ) : (
              <>
                {limited && (
                  <p className="knowledge-view__dialog-hint">
                    {remaining === 0 || limit === "claims" || limit === "operations"
                      ? fullText(limit)
                      : `Only ${remaining} more ${remaining === 1 ? "page" : "pages"} can be added (maximum ${MAX_LINKS} links).`}
                  </p>
                )}
                <ul className="knowledge-view__dialog-list">
                  {candidates.map((page) => {
                    const checked = chosen.some((item) => item.key === page.key);
                    return (
                      <li key={page.key}>
                        <label className="knowledge-view__dialog-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy || (!checked && full)}
                            onChange={(event) => choose(page.key, event.target.checked)}
                          />
                          <span className="knowledge-view__dialog-text">
                            <strong>{page.label}</strong>
                            {page.label !== page.url && (
                              <>
                                {" "}
                                <small>{page.url}</small>
                              </>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {saveError && <p className="knowledge-view__dialog-error" role="alert">{saveError}</p>}
            <div className="knowledge-view__dialog-actions">
              <button type="button" className="knowledge-view__site-add" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="knowledge-view__site-import" disabled={busy || chosen.length === 0} aria-busy={busy}>
                Add selected
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
