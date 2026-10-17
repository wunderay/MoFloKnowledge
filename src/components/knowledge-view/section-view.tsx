import type { BusinessEntry, EntryKind } from "@/contracts";
import { profileFrom } from "./data";
import { CustomersIndustry } from "./customers-industry";
import { GeneralInfo } from "./general-info";
import { SalesMarketing } from "./sales-marketing";
import { KNOWLEDGE_SECTIONS, type KnowledgeSectionId } from "./sections";

/** The selected section of the company's knowledge, laid out as the MoFlo Cloud reference shows. */
export function SectionView({
  section,
  companyId,
  name,
  entries,
}: {
  section: KnowledgeSectionId;
  companyId: string;
  name: string;
  entries: { kind: EntryKind; content: BusinessEntry }[];
}) {
  const profile = profileFrom(entries);
  if (section === "general") return <GeneralInfo companyId={companyId} name={name} profile={profile} />;
  if (section === "customers") return <CustomersIndustry companyId={companyId} profile={profile} />;
  if (section === "sales") return <SalesMarketing companyId={companyId} name={name} profile={profile} />;
  const label = KNOWLEDGE_SECTIONS.find((item) => item.id === section)!.label;
  return <p className="knowledge-view__placeholder">{label} is not shown in this view yet.</p>;
}
