import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { RevertEntrySchema } from "../../../../../../../contracts/api-entries";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, RevertEntrySchema);
  const p = await c.params;
  return rpc(client, "revert_entry", {
    p_company: IdSchema.parse(p.companyId),
    p_entry: IdSchema.parse(p.entryId),
    p_from_revision: b.fromRevision,
    p_expected_revision: b.expectedRevision,
    p_request: b.requestId,
  });
});
