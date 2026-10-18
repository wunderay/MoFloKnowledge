import { route, readJson, rpc } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { CreateEntrySchema } from "../../../../../contracts/api-entries";
import { prepareManualCreation } from "../../../../../server/revisions";
import { parseBusinessEntry } from "../../../../../contracts";
export const POST = route(async (r, c, { client, user }) => {
  const b = await readJson(r, CreateEntrySchema);
  return rpc(client, "create_entry", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_kind: b.kind,
    p_content: parseBusinessEntry(b.kind, b.content),
    p_provenance: prepareManualCreation(
      b.kind,
      b.content,
      b.requestId,
      user.id,
      b.genderAttestation,
    ),
    p_request: b.requestId,
  });
}, 201);
