import { KnowledgeViewer } from "@/components/knowledge-viewer";
import { verifiedSession } from "@/lib/supabase/server";
import { readDraft } from "@/server/read-model";
import { readSnapshot, readVersionSummaries } from "@/server/snapshots";
import { UUIDSchema } from "@/contracts";
import { Notice } from "@/components/ui";
import { redirect } from "next/navigation";
export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; versionId?: string }>;
}) {
  const params = await searchParams;
  const id = UUIDSchema.safeParse(params.companyId);
  if (!id.success)
    return (
      <Notice error>
        Select a company from the dashboard to view saved knowledge.
      </Notice>
    );
  const { client, user } = await verifiedSession();
  if (!user) redirect("/sign-in");
  if (
    params.versionId &&
    params.versionId !== "draft" &&
    !UUIDSchema.safeParse(params.versionId).success
  )
    return <Notice error>This saved version is unavailable.</Notice>;
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
