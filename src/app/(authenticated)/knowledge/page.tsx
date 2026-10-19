import { crawlLimits } from "@/lib/config/crawl-limits";
import { KnowledgeEditor } from "@/components/editor/knowledge-editor";
import { CreateCompany } from "@/components/editor/create-company";
import { verifiedSession } from "@/lib/supabase/server";
import { readDraft } from "@/server/read-model";
import { UUIDSchema } from "@/contracts";
import { parseSection } from "@/components/knowledge-view/sections";
import { Notice } from "@/components/shared/ui";
import { redirect } from "next/navigation";
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; section?: string; offering?: string; person?: string }>;
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
    return (
      <KnowledgeEditor
        key={id.data}
        companyId={id.data}
        initialDraft={initialDraft}
        captureLimits={captureLimits()}
        initialSection={parseSection(params.section)}
        initialOffering={params.offering ?? ""}
        initialPerson={params.person ?? ""}
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
