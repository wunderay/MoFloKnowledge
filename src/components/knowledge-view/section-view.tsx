import type { BusinessEntry, CitationContext, EntryKind, EntryProvenance, ReviewStatus } from "@/contracts";
import { offeringsFrom, peopleFrom, profileFrom, siteLinksFrom } from "./data";
import { BrandIdentity } from "./brand";
import { CustomersIndustry } from "./customers-industry";
import { GeneralInfo } from "./general-info";
import { EditProvider, type EditEnv } from "./inline-edit";
import { KeyPeople } from "./key-people";
import { BusinessOfferings } from "./offerings";
import { SalesMarketing } from "./sales-marketing";
import { SectionSkeleton } from "./section-skeleton";
import { KNOWLEDGE_SECTIONS, sectionLabel, type KnowledgeSectionId } from "./sections";
import { SiteKnowledge } from "./site-knowledge";

/** The entry kinds a section reads; a section has data once one of them exists. */
const SECTION_KINDS: Record<Exclude<KnowledgeSectionId, "site" | "all">, EntryKind[]> = {
  general: ["company_foundation"],
  brand: ["branding_and_style"],
  offerings: ["offering"],
  customers: ["market_and_customers"],
  sales: ["positioning", "online_presence"],
  "key-people": ["key_person"],
};

/** The selected section of the company's knowledge, laid out as the MoFlo Cloud reference shows. */
export function SectionView({
  section,
  companyId,
  name,
  entries,
  citationContext,
  offeringId = "",
  onSelectOffering = () => undefined,
  personId = "",
  onSelectPerson = () => undefined,
  canEdit = false,
  actorId = "",
  generation = null,
  importBlocked = false,
  crawling = false,
  onSaved = () => Promise.resolve(),
}: {
  section: KnowledgeSectionId;
  companyId: string;
  name: string;
  entries: {
    id?: string;
    current_revision?: number;
    kind: EntryKind;
    content: BusinessEntry;
    provenance: EntryProvenance;
    review_status: ReviewStatus;
  }[];
  citationContext?: CitationContext;
  /** The `offering` URL value and how a click on the offering list changes it. */
  offeringId?: string;
  onSelectOffering?: (id: string) => void;
  /** The `person` URL value and how a click on the key people list changes it ("" selects the first person). */
  personId?: string;
  onSelectPerson?: (id: string) => void;
  /** An editable draft offers "+ Add page", "Import from website" and the key people actions; `onSaved` reloads the draft after it saved. */
  canEdit?: boolean;
  actorId?: string;
  /** The draft's generation, which renaming the company quotes (null: the name cannot be edited). */
  generation?: number | null;
  /** True while the view is older than a saved import: the picker would work from stale entries. */
  importBlocked?: boolean;
  /** The company's crawl is queued or running: a section without data yet shows a skeleton instead of its empty state. */
  crawling?: boolean;
  onSaved?: (what?: "changes") => Promise<void>;
}) {
  const profile = profileFrom(entries, citationContext);
  // An editable draft edits General Info, Customers & Industry, Sales & Marketing, Business Offerings and Brand Identity in place; everything else reads only.
  const edit: EditEnv | null =
    canEdit && actorId
      ? {
          companyId,
          actorId,
          blocked: importBlocked,
          onSaved: () => onSaved("changes"),
          entry: (kind) => {
            // An offering (or any entry that is one of many) is asked for as "<kind>@<entry id>"; the others by their kind.
            const [base, id] = kind.split("@");
            const found = entries.find((item) => (id === undefined ? item.kind === kind : item.kind === base && item.id === id));
            return found?.id !== undefined
              ? { id: found.id, revision: found.current_revision ?? 0, content: found.content, provenance: found.provenance }
              : null;
          },
        }
      : null;
  const has = (...kinds: EntryKind[]) => entries.some((item) => kinds.includes(item.kind));
  const one = (id: KnowledgeSectionId, level: "h2" | "h3" = "h2") => {
    if (crawling) {
      const empty =
        id === "site"
          ? siteLinksFrom(entries).links.length === 0
          : !has(...SECTION_KINDS[id as Exclude<KnowledgeSectionId, "site" | "all">]);
      if (empty) {
        return <SectionSkeleton label={sectionLabel(id)} shape={id === "site" || id === "offerings" || id === "key-people" ? "list" : "text"} />;
      }
    }
    if (id === "key-people") {
      return (
        <KeyPeople
          companyId={companyId}
          people={peopleFrom(entries, citationContext)}
          selectedId={personId}
          onSelect={onSelectPerson}
          canEdit={canEdit && Boolean(actorId)}
          blocked={importBlocked}
          onSaved={onSaved}
        />
      );
    }
    if (id === "general") {
      return <GeneralInfo companyId={companyId} name={name} profile={profile} />;
    }
    if (id === "customers") {
      return <CustomersIndustry companyId={companyId} profile={profile} />;
    }
    if (id === "sales") {
      return <SalesMarketing companyId={companyId} name={name} profile={profile} />;
    }
    if (id === "offerings") {
      return (
        <BusinessOfferings
          companyId={companyId}
          offerings={offeringsFrom(entries, citationContext)}
          canEdit={edit !== null}
          blocked={importBlocked}
          onSaved={onSaved}
          selectedId={offeringId}
          onSelect={onSelectOffering}
        />
      );
    }
    if (id === "brand") {
      return (
        <BrandIdentity
          companyId={companyId}
          name={name}
          profile={profile}
          rename={edit && generation !== null ? { generation, blocked: importBlocked, onRenamed: () => onSaved("changes") } : undefined}
        />
      );
    }
    return (
      <SiteKnowledge
        companyId={companyId}
        site={siteLinksFrom(entries, citationContext)}
        canEdit={canEdit}
        actorId={actorId}
        website={profile.foundation.website}
        importBlocked={importBlocked}
        onSaved={onSaved}
        level={level}
      />
    );
  };
  const shown =
    section !== "all" ? (
      one(section)
    ) : (
      // Every section under its own heading, in listbox order. Business Offerings and Key People carry their own heading.
      <div className="knowledge-view__all">
        {KNOWLEDGE_SECTIONS.filter((item) => item.id !== "all").map((item) => (
          <section className="knowledge-view__all-section" key={item.id}>
            {item.id !== "offerings" && item.id !== "key-people" && (
              <h2 className="knowledge-view__section-title knowledge-view__all-title">{item.label}</h2>
            )}
            {one(item.id, "h3")}
          </section>
        ))}
      </div>
    );
  return edit ? <EditProvider env={edit}>{shown}</EditProvider> : shown;
}
