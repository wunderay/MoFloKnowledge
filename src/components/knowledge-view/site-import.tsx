"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import {
  createEmptyProvenance,
  createEntryDefault,
  entryBusiness,
  parseBusinessEntry,
  requiredCoverageTargets,
  type SiteLink,
} from "@/contracts";
import { URLSchema } from "@/contracts/primitives";
import type { SourceCoverage } from "@/contracts/source-coverage";
import { reviseProvenance } from "@/knowledge/revise-provenance";
import { ApiError, api, companyPath, write } from "../api-client";
import type { ViewSiteLinks } from "./data";

/** The most links one site_links entry can hold. */
export const MAX_LINKS = 500;

type Candidate = { key: string; label: string; url: string };
const normalized = (url: string) => {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
};

/**
 * The captured pages that can become links: plain http(s) addresses without credentials that are
 * not stored links yet, each address once, in the inventory's order.
 */
export function importCandidates(pages: SourceCoverage["pages"], stored: SiteLink[]): Candidate[] {
  const seen = new Set(stored.map((link) => normalized(link.url)));
  const out: Candidate[] = [];
  for (const page of pages) {
    if (page.state !== "captured" || !URLSchema.safeParse(page.url).success) continue;
    const key = normalized(page.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: page.title?.trim() || page.url, url: page.url });
  }
  return out;
}

/** Saves `added` after the stored links, the way the editor saves an entry: a new entry or a new revision. */
async function saveLinks(companyId: string, actorId: string, site: ViewSiteLinks, added: Candidate[]) {
  const links = [
    ...site.links,
    ...added.map((page) => ({ id: crypto.randomUUID(), title: page.label.slice(0, 20000), url: page.url, note: null })),
  ];
  const content = parseBusinessEntry("site_links", { links });
  const requestId = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  const note = "Pages imported from the website crawl.";
  const { entry } = site;
  if (!entry || entry.revision === 0) {
    // As prepareManualCreation does: coverage for every required field, then the new values as claims.
    const empty = createEmptyProvenance();
    empty.coverage = requiredCoverageTargets(entryBusiness("site_links", content)).map((target) => ({
      targets: [target],
      status: "not_checked" as const,
      job_id: null,
      reason: "Entered manually; website extraction has not assessed this field.",
    }));
    const provenance = reviseProvenance({
      kind: "site_links",
      entryId: requestId,
      before: createEntryDefault("site_links", requestId),
      after: content,
      provenance: empty,
      actorId,
      savedAt,
      requestId,
      note,
    });
    await api(companyPath(companyId, "/entries"), write("POST", { kind: "site_links", content, provenance, requestId }));
    return;
  }
  const stored = structuredClone(entry.provenance);
  if (!stored.coverage.length)
    stored.coverage = [
      {
        targets: ["/site_links/links"],
        status: "not_checked" as const,
        job_id: null,
        reason: "Manually entered section. Website coverage has not been checked.",
      },
    ];
  const provenance = reviseProvenance({
    kind: "site_links",
    entryId: entry.id,
    before: entry.content,
    after: content,
    provenance: stored,
    actorId,
    savedAt,
    requestId,
    note,
  });
  await api(
    companyPath(companyId, `/entries/${entry.id}/revisions`),
    write("POST", {
      expectedRevision: entry.revision,
      content,
      provenance,
      reviewStatus: "unreviewed",
      reason: note,
      requestId,
    }),
  );
}

const errorText = (error: unknown) =>
  error instanceof ApiError && error.status === 409
    ? "This list changed since the page was loaded. Reload the page to get the latest links, then import again."
    : error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join("; ")
      : (error as Error).message;

/** "Import from website" and the dialog that lists the captured pages that are not links yet. */
export function SiteImport({
  companyId,
  actorId,
  site,
  onSaved,
}: {
  companyId: string;
  actorId: string;
  site: ViewSiteLinks;
  /** Reloads the draft after a save so the card shows the new links. */
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
  const remaining = Math.max(0, MAX_LINKS - site.links.length);
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
      <button type="button" className="knowledge-view__site-import" onClick={show}>
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
                    {remaining === 0
                      ? `The list already has the maximum of ${MAX_LINKS} links, so no more pages can be added.`
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
