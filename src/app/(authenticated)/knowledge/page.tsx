import { crawlLimits } from "@/lib/config/crawl-limits";
import { KnowledgeEditor } from "@/components/editor/knowledge-editor";
import { verifiedSession } from "@/lib/supabase/server";
import { readDraft } from "@/server/read-model";
import { UUIDSchema } from "@/contracts";
import { Notice } from "@/components/shared/ui";
import { redirect } from "next/navigation";
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const params = await searchParams;
  const id = UUIDSchema.safeParse(params.companyId);
  if (!id.success) {
    return (
      <Notice error>
        Select a company from the dashboard to open its workspace.
      </Notice>
    );
  }
  const { client, user } = await verifiedSession();
  if (!user) {
    redirect("/sign-in");
  }
  try {
    const initialDraft = await readDraft(client, id.data, user.id);
    return (
      <KnowledgeEditor
        key={id.data}
        companyId={id.data}
        initialDraft={initialDraft}
        captureLimits={captureLimits()}
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
