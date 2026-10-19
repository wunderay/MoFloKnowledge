import { crawlLimits } from "@/lib/config/crawl-limits";
import { KnowledgeEditor } from "@/components/editor/knowledge-editor";
import { CreateCompany } from "@/components/editor/create-company";
import { verifiedSession } from "@/lib/supabase/server";
import { readDraft } from "@/server/read-model";
import { UUIDSchema } from "@/contracts";
import { parseSection, sectionOfKind } from "@/components/knowledge-view/sections";
import { Notice } from "@/components/shared/ui";
import { redirect } from "next/navigation";
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    section?: string;
    offering?: string;
    person?: string;
    /** Links from before the hub: an entry kind and, for an offering or a person, the entry to open. */
    category?: string;
    entryId?: string;
  }>;
}) {
  const params = await searchParams;
  const { client, user } = await verifiedSession();
  if (!user) {
    redirect("/sign-in");
  }
  const id = UUIDSchema.safeParse(params.companyId);
  // Without a company, the hub starts at its first step: name a company and give its website to crawl.
  if (!id.success) {
    return <CreateCompany limits={captureLimits()} />;
  }
  try {
    const initialDraft = await readDraft(client, id.data, user.id);
    // `entryId` may be the stored entry's id ("Edit draft") or the offering's or person's own id (the section links).
    const linked = params.entryId
      ? initialDraft.entries.find(
          (entry) => entry.id === params.entryId || ("id" in entry.content && entry.content.id === params.entryId),
        )
      : undefined;
    const linkedId = linked && "id" in linked.content && typeof linked.content.id === "string" ? linked.content.id : "";
    const section =
      params.section !== undefined
        ? parseSection(params.section)
        : (sectionOfKind(params.category) ?? sectionOfKind(linked?.kind) ?? "general");
    return (
      <KnowledgeEditor
        key={id.data}
        companyId={id.data}
        initialDraft={initialDraft}
        captureLimits={captureLimits()}
        initialSection={section}
        initialOffering={params.offering ?? (linked?.kind === "offering" ? linkedId : "")}
        initialPerson={params.person ?? (linked?.kind === "key_person" ? linkedId : "")}
      />
    );
  } catch {
    return (
      <Notice error>
        This company is unavailable. Check your membership or return to the
        dashboard.
      </Notice>
    );
  }
}

/** The configured capture limits for the client form; null means no maximum. */
function captureLimits() {
  const limits = crawlLimits();
  const finite = (value: number) => (Number.isFinite(value) ? value : null);
  return {
    maxPages: finite(limits.maxPages),
    maxDepth: finite(limits.maxDepth),
    defaultPages: limits.defaultPages,
    defaultDepth: limits.defaultDepth,
  };
}
