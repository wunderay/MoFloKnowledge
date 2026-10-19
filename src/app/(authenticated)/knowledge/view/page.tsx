import { KnowledgeViewer } from "@/components/shared/knowledge-viewer";
import { KnowledgeEditor } from "@/components/editor/knowledge-editor";
import { crawlLimits } from "@/lib/config/crawl-limits";
import { verifiedSession } from "@/lib/supabase/server";
import { readDraft } from "@/server/read-model";
import { readCapturedExtras } from "@/server/captured-extras";
import { readCapturedHooks } from "@/server/captured-hooks";
import { CapturedExtrasSection } from "@/components/knowledge-view/captured-extras";
import { readSnapshot, readVersionSummaries } from "@/server/snapshots";
import { UUIDSchema } from "@/contracts";
import { parseSection, sectionOfKind } from "@/components/knowledge-view/sections";
import { Notice } from "@/components/shared/ui";
import { redirect } from "next/navigation";

interface Params {
  companyId?: string;
  versionId?: string;
  section?: string;
  offering?: string;
  person?: string;
  /** Links from before the hub: an entry kind and, for an offering or a person, the entry to open. */
  category?: string;
  entryId?: string;
}

/**
 * One company: the Scrape & Build hub (its draft, edited in place, and the website crawl), or with `versionId` one of its
 * saved knowledge versions (`draft`: the draft, read only). Without a valid company it goes back to the company list.
 */
export default async function ViewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const id = UUIDSchema.safeParse(params.companyId);
  if (!id.success) {
    redirect("/knowledge");
  }
  const { client, user } = await verifiedSession();
  if (!user) {
    redirect("/sign-in");
  }
  if (!params.versionId) {
    return hub(client, id.data, user.id, params);
  }
  if (params.versionId !== "draft" && !UUIDSchema.safeParse(params.versionId).success) {
    return <Notice error>This saved version is unavailable.</Notice>;
  }
  return version(client, id.data, user.id, params.versionId, params);
}

type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];

async function hub(client: Client, companyId: string, userId: string, params: Params) {
  try {
    const initialDraft = await readDraft(client, companyId, userId);
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
        key={companyId}
        companyId={companyId}
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

async function version(client: Client, companyId: string, userId: string, versionId: string, params: Params) {
  const section = parseSection(params.section);
  // The selected offering's entry id; one that matches no offering selects the first.
  const offering =
    typeof params.offering === "string" ? params.offering : undefined;
  // The selected key person's entry id; one that matches nobody selects the first person.
  const person = typeof params.person === "string" ? params.person : undefined;
  try {
    const versions = await readVersionSummaries(client, companyId, userId);
    const extras = await readCapturedExtras(client, companyId).catch(() => ({
      faqs: [],
      contacts: [],
    }));
    const hooks = await readCapturedHooks(client, companyId).catch(() => ({
      headlines: [],
      ctas: [],
      leadMagnets: [],
      hours: [],
    }));
    if (versionId === "draft") {
      const draft = await readDraft(client, companyId, userId);
      return (
        <KnowledgeViewer
          key={companyId}
          companyId={companyId}
          initialVersionId="draft"
          initialSection={section}
          initialOffering={offering}
          initialPerson={person}
          capturedExtras={<CapturedExtrasSection extras={extras} hooks={hooks} />}
          initialData={{ companyName: draft.company.name, versions, draft }}
        />
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
    const saved = await readSnapshot(client, companyId, versionId, userId);
    return (
      <KnowledgeViewer
        key={companyId}
        companyId={companyId}
        initialVersionId={versionId}
        initialSection={section}
        initialOffering={offering}
        initialPerson={person}
        capturedExtras={<CapturedExtrasSection extras={extras} hooks={hooks} />}
        initialData={{
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
          companyName: saved.payload.provenance.company.name,
          versions,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
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
