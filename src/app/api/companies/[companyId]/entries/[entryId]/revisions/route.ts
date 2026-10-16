import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
import { prepareRevision } from "../../../../../../../server/revisions";
export const runtime = "nodejs";
import { SaveEntrySchema } from "../../../../../../../contracts/api-entries";
export const POST = route(async (r, c, { client, user }) => {
  const p = await c.params;
  const b = await readJson(r, SaveEntrySchema);
  const safe = await prepareRevision(
    client,
    IdSchema.parse(p.companyId),
    IdSchema.parse(p.entryId),
    user!.id,
    b,
  );
  return rpc(client, "save_entry_revision", {
    p_company: IdSchema.parse(p.companyId),
    p_entry: IdSchema.parse(p.entryId),
    p_expected_revision: b.expectedRevision,
    p_content: safe.content,
    p_provenance: safe.provenance,
    p_review_status: b.reviewStatus,
    p_reason: b.reason ?? null,
    p_request: b.requestId,
  });
});
