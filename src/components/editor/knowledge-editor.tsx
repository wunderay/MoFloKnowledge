"use client";
import "./knowledge-editor.css";
import "../knowledge-view/knowledge-view.css";
import { useCallback, useEffect, useState } from "react";
import type { DraftEntry, DraftResponse } from "@/contracts/api-types";
import type { CitationContext } from "@/contracts";
import { api, companyPath } from "../shared/api-client";
import { Notice, useHydrated } from "../shared/ui";
import { SectionListbox } from "../knowledge-view/section-listbox";
import { SectionView } from "../knowledge-view/section-view";
import { type KnowledgeSectionId } from "../knowledge-view/sections";
import { ScrapeProgress, type CaptureLimits } from "./scrape-progress";
import { PublicationDialog } from "./publication-dialog";
import { CompanySettings } from "./company-settings";
import { ProposalReview } from "./proposal-review";
import { HubReview } from "./hub-review";
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

/** Sets one URL parameter (or removes it when empty) without a navigation, so a reload reopens the same place. */
function setParam(name: string, value: string) {
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set(name, value);
  } else {
    url.searchParams.delete(name);
  }
  window.history.replaceState(null, "", url);
}

/**
 * The results area of the Scrape & Build hub: the company's draft shown section by section as the MoFlo reference shows it, each
 * value edited in place, with the website crawl below and "Save knowledge version" as the one Save.
 */
export function KnowledgeEditor({
  companyId,
  initialDraft,
  captureLimits,
  initialSection = "general",
  initialOffering = "",
  initialPerson = "",
}: {
  companyId: string;
  initialDraft?: Draft;
  captureLimits?: CaptureLimits;
  /** The `section`, `offering` and `person` URL values the page was opened with. */
  initialSection?: KnowledgeSectionId;
  initialOffering?: string;
  initialPerson?: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(initialDraft ?? null);
  const hydrated = useHydrated();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [publish, setPublish] = useState(false);
  const [settings, setSettings] = useState(false);
  /** A change was saved but the draft could not be read again: the view is older than what is stored. */
  const [stale, setStale] = useState<string | null>(null);
  // "All sections" belongs to the saved-version view; the hub shows the seven sections of the reference.
  const [section, setSection] = useState<KnowledgeSectionId>(initialSection === "all" ? "general" : initialSection);
  const [offeringId, setOfferingId] = useState(initialOffering);
  const [personId, setPersonId] = useState(initialPerson);
  const refresh = useCallback(async () => {
    try {
      setDraft(await api<Draft>(companyPath(companyId, "/draft")));
      setStale(null);
      return true;
    } catch (e) {
      setStale((e as Error).message);
      return false;
    }
  }, [companyId]);
  useEffect(() => {
    if (!initialDraft) {
      void refresh().then((loaded) => {
        if (!loaded) {
          setError("The company knowledge could not be loaded. Reload the page to try again.");
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialDraft only decides whether the first load is needed; changing it must not refetch
  }, [refresh]);
  if (!draft) {
    return error ? (
      <Notice error>{error}</Notice>
    ) : (
      <Notice>Loading company knowledge…</Notice>
    );
  }
  const membershipCanEdit =
    draft.company.role !== "viewer" && !draft.company.archived_at;
  const canEdit = hydrated && membershipCanEdit;
  return (
    <div className="knowledge-editor knowledge-view">
      <h1 className="sr-only">{draft.company.name}</h1>
      {!membershipCanEdit && (
        <Notice>
          {draft.company.archived_at
            ? "This company is archived. Saved knowledge and history remain available."
            : "You have viewer access. You can inspect the knowledge and download saved versions."}
        </Notice>
      )}
      {stale !== null && (
        <Notice>
          {`Saved. Reload to see the latest changes. The draft could not be read: ${stale}`}{" "}
          <button type="button" className="button" onClick={() => void refresh()}>
            Reload
          </button>
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <nav className="knowledge-view__nav" aria-label="Knowledge navigation">
        <div className="knowledge-view__nav-box">
          <span className="knowledge-view__tab" aria-current="page">Company</span>
        </div>
        <div className="knowledge-view__nav-box">
          <SectionListbox
            value={section}
            withAll={false}
            onSelect={(next) => {
              setSection(next);
              setParam("section", next);
            }}
          />
        </div>
        <div className="knowledge-editor__actions">
          <button
            className="button button--primary"
            disabled={!canEdit}
            onClick={() => { setPublish(true); }}
          >
            Save knowledge version
          </button>
          {draft.company.role !== "viewer" && (
            <button
              className="button"
              onClick={() => { setSettings(true); }}
              aria-label="Company settings"
            >
              ⚙
            </button>
          )}
        </div>
      </nav>
      <div className="knowledge-view__panel">
        <SectionView
          section={section}
          companyId={companyId}
          name={draft.company.name}
          entries={draft.entries}
          citationContext={draft.citationContext}
          canEdit={canEdit}
          actorId={draft.actorId}
          generation={draft.draftGeneration}
          importBlocked={stale !== null}
          evidence={false}
          onSaved={async () => {
            setMessage("");
            await refresh();
          }}
          offeringId={offeringId}
          onSelectOffering={(id) => {
            setOfferingId(id);
            setParam("offering", id);
          }}
          personId={personId}
          onSelectPerson={(id) => {
            setPersonId(id);
            setParam("person", id);
          }}
        />
      </div>
      <HubReview companyId={companyId} entries={draft.entries} canEdit={canEdit} onChanged={refresh} />
      <ProposalReview
        citationContext={draft.citationContext}
        companyId={companyId}
        entries={draft.entries}
        canEdit={canEdit}
        onApplied={refresh}
      />
      <div className="cloud-knowledge__capture">
        <h2>Website capture</h2>
        <p className="muted">Crawl the company website again to find new or changed facts.</p>
        <ScrapeProgress
          companyId={companyId}
          website={draft.company.website_url}
          canEdit={canEdit}
          onComplete={refresh}
          limits={captureLimits}
        />
      </div>
      {publish && (
        <PublicationDialog
          companyId={companyId}
          onClose={() => { setPublish(false); }}
          onSaved={() => {
            setMessage("Knowledge version saved. The snapshot is permanent.");
            void refresh();
          }}
        />
      )}
      {settings && (
        <CompanySettings
          companyId={companyId}
          company={draft.company}
          generation={draft.draftGeneration}
          onClose={() => { setSettings(false); }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
