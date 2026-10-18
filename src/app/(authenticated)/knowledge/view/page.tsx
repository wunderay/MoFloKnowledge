import { KnowledgeViewer } from "@/components/shared/knowledge-viewer";
import { verifiedSession } from "@/lib/supabase/server";
import { readDraft } from "@/server/read-model";
import { readSnapshot, readVersionSummaries } from "@/server/snapshots";
import { UUIDSchema } from "@/contracts";
import { parseSection } from "@/components/knowledge-view/sections";
import { Notice } from "@/components/shared/ui";
import { redirect } from "next/navigation";
export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    versionId?: string;
    section?: string;
    offering?: string;
    person?: string;
  }>;
}) {
  const params = await searchParams;
  const section = parseSection(params.section);
  // The selected offering's entry id; one that matches no offering selects the first.
  const offering = typeof params.offering === "string" ? params.offering : undefined;
  // The selected key person's entry id; one that matches nobody selects the first person.
  const person = typeof params.person === "string" ? params.person : undefined;
  const id = UUIDSchema.safeParse(params.companyId);
  if (!id.success) {
    return (
      <Notice error>
        Select a company from the dashboard to view saved knowledge.
      </Notice>
    );
  }
  const { client, user } = await verifiedSession();
  if (!user) {
    redirect("/sign-in");
  }
  if (
    params.versionId &&
    params.versionId !== "draft" &&
    !UUIDSchema.safeParse(params.versionId).success
  ) {
    return <Notice error>This saved version is unavailable.</Notice>;
  }
  try {
    const versions = await readVersionSummaries(client, id.data, user.id);
    const versionId = params.versionId ?? versions[0]?.id ?? "draft";
    if (versionId === "draft") {
      const draft = await readDraft(client, id.data, user.id);
      return (
        <KnowledgeViewer
          key={id.data}
          companyId={id.data}
          initialVersionId="draft"
          initialSection={section}
          initialOffering={offering}
          initialPerson={person}
          initialData={{ companyName: draft.company.name, versions, draft }}
        />
      );
    }
    const saved = await readSnapshot(client, id.data, versionId, user.id);
    return (
      <KnowledgeViewer
        key={id.data}
        companyId={id.data}
        initialVersionId={versionId}
        initialSection={section}
        initialOffering={offering}
        initialPerson={person}
        initialData={{
          companyName: saved.payload.provenance.company.name,
          versions,
          snapshot: saved.payload,
        }}
      />
    );
  } catch {
    return (
      <Notice error>
        This company's knowledge is unavailable. Check your membership or return
        to the dashboard.
      </Notice>
    );
  }
}
