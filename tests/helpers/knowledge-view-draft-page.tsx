// The read-only draft view (KnowledgeViewer with versionId "draft"), rendered as /knowledge/view rendered it before that
// page showed a draft in the Scrape & Build hub: the same data reads and the same props. The viewer's own tests use it.
import type React from "react";
import { KnowledgeViewer } from "../../src/components/shared/knowledge-viewer";
import { CapturedExtrasSection } from "../../src/components/knowledge-view/captured-extras";
import { parseSection } from "../../src/components/knowledge-view/sections";
import { readCapturedExtras } from "../../src/server/captured-extras";
import { readCapturedHooks } from "../../src/server/captured-hooks";
import { readDraft } from "../../src/server/read-model";
import { readVersionSummaries } from "../../src/server/snapshots";

export async function draftViewPage(params: { companyId: string; section?: string; offering?: string; person?: string }): Promise<React.ReactElement> {
  const client = {} as never;
  const versions = await readVersionSummaries(client, params.companyId, "user-1");
  const extras = await readCapturedExtras(client, params.companyId).catch(() => ({ faqs: [], contacts: [] }));
  const hooks = await readCapturedHooks(client, params.companyId).catch(() => ({ headlines: [], ctas: [], leadMagnets: [], hours: [] }));
  const draft = await readDraft(client, params.companyId, "user-1");
  return (
    <KnowledgeViewer
      key={params.companyId}
      companyId={params.companyId}
      initialVersionId="draft"
      initialSection={parseSection(params.section)}
      initialOffering={params.offering}
      initialPerson={params.person}
      capturedExtras={<CapturedExtrasSection extras={extras} hooks={hooks} />}
      initialData={{ companyName: draft.company.name, versions, draft }}
    />
  );
}
