import type { BusinessEntry, CitationContext, EntryKind, EntryProvenance, ReviewStatus } from "@/contracts";
import { offeringsFrom, profileFrom, siteLinksFrom } from "./data";
import { BrandIdentity } from "./brand";
import { CustomersIndustry } from "./customers-industry";
import { GeneralInfo } from "./general-info";
import { BusinessOfferings } from "./offerings";
import { SalesMarketing } from "./sales-marketing";
import { KNOWLEDGE_SECTIONS, type KnowledgeSectionId } from "./sections";
import { SiteKnowledge } from "./site-knowledge";

/** The selected section of the company's knowledge, laid out as the MoFlo Cloud reference shows. */
export function SectionView({
  section,
  companyId,
  name,
  entries,
  citationContext,
  offeringId = "",
  onSelectOffering = () => {},
  canEdit = false,
  actorId = "",
  onSaved = async () => {},
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
  /** An editable draft offers "Import from website"; `onSaved` reloads the draft after it saved. */
  canEdit?: boolean;
  actorId?: string;
  onSaved?: () => Promise<void>;
}) {
  const profile = profileFrom(entries, citationContext);
  const one = (id: KnowledgeSectionId, level: "h2" | "h3" = "h2") => {
    if (id === "general") return <GeneralInfo companyId={companyId} name={name} profile={profile} />;
    if (id === "customers") return <CustomersIndustry companyId={companyId} profile={profile} />;
    if (id === "sales") return <SalesMarketing companyId={companyId} name={name} profile={profile} />;
    if (id === "offerings")
      return (
        <BusinessOfferings
          companyId={companyId}
          offerings={offeringsFrom(entries, citationContext)}
          selectedId={offeringId}
          onSelect={onSelectOffering}
        />
      );
    if (id === "brand") return <BrandIdentity companyId={companyId} name={name} profile={profile} />;
    return (
      <SiteKnowledge
        companyId={companyId}
        site={siteLinksFrom(entries, citationContext)}
        canEdit={canEdit}
        actorId={actorId}
        onSaved={onSaved}
        level={level}
      />
    );
  };
  if (section !== "all") return one(section);
  // Every section under its own heading, in selector order. Business Offerings carries its own heading.
  return (
    <div className="knowledge-view__all">
      {KNOWLEDGE_SECTIONS.filter((item) => item.id !== "all").map((item) => (
        <section className="knowledge-view__all-section" key={item.id}>
          {item.id !== "offerings" && (
            <h2 className="knowledge-view__section-title knowledge-view__all-title">{item.label}</h2>
          )}
          {one(item.id, "h3")}
        </section>
      ))}
    </div>
  );
}
