import { route, readJson, rpc } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readDraft } from "../../../../../server/read-model";
import { assemblePreview } from "../../../../../knowledge/assemble";
export const GET = route(async (_r, c, { client, user }) => {
  const draft = await readDraft(
    client,
    IdSchema.parse((await c.params).companyId),
    user!.id,
  );
  const preview = assemblePreview(
    draft.entries.map((e) => ({
      ...e,
      entry_id: e.id,
      revision: e.current_revision,
      saved_at: e.saved_at ?? e.created_at,
    })),
  );
  return { draftGeneration: draft.draftGeneration, ...preview };
});
