import type { BusinessEntry, CitationContext, EntryKind, EntryProvenance, ReviewStatus } from "@/contracts";
import { offeringsFrom, profileFrom } from "./data";
import { BrandIdentity } from "./brand";
import { CustomersIndustry } from "./customers-industry";
import { GeneralInfo } from "./general-info";
import { BusinessOfferings } from "./offerings";
import { SalesMarketing } from "./sales-marketing";
import { KNOWLEDGE_SECTIONS, type KnowledgeSectionId } from "./sections";

/** The selected section of the company's knowledge, laid out as the MoFlo Cloud reference shows. */
export function SectionView({
  section,
  companyId,
  name,
  entries,
  citationContext,
  offeringId = "",
  onSelectOffering = () => {},
}: {
  section: KnowledgeSectionId;
  companyId: string;
  name: string;
  entries: { kind: EntryKind; content: BusinessEntry; provenance: EntryProvenance; review_status: ReviewStatus }[];
  citationContext?: CitationContext;
  /** The `offering` URL value and how a click on the offering list changes it. */
  offeringId?: string;
  onSelectOffering?: (id: string) => void;
}) {
  const profile = profileFrom(entries, citationContext);
  if (section === "general") return <GeneralInfo companyId={companyId} name={name} profile={profile} />;
  if (section === "customers") return <CustomersIndustry companyId={companyId} profile={profile} />;
  if (section === "sales") return <SalesMarketing companyId={companyId} name={name} profile={profile} />;
  if (section === "offerings")
    return (
      <BusinessOfferings
        companyId={companyId}
        offerings={offeringsFrom(entries, citationContext)}
        selectedId={offeringId}
        onSelect={onSelectOffering}
      />
    );
  if (section === "brand") return <BrandIdentity companyId={companyId} name={name} profile={profile} />;
  const label = KNOWLEDGE_SECTIONS.find((item) => item.id === section)!.label;
  return <p className="knowledge-view__placeholder">{label} is not shown in this view yet.</p>;
}
