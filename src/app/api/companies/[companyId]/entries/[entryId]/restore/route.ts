import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
import { RestoreEntrySchema } from "../../../../../../../contracts/api-entries";
import { authorizeCompany } from "../../../../../../../server/authorize";
export const runtime = "nodejs";

/**
 * Brings back a key person or an offering that was deleted (the Undo of a deletion). The entry was only archived, so it
 * returns with its revisions and evidence.
 */
export const POST = route(async (r, c, { client, user }) => {
  const p = await c.params;
  const company = IdSchema.parse(p.companyId);
  const entry = IdSchema.parse(p.entryId);
  // Membership and role first: a non-member or viewer learns nothing about the body rules.
  await authorizeCompany(client, company, user!.id, true);
  await readJson(r, RestoreEntrySchema);
  return rpc(client, "restore_entry", { p_company: company, p_entry: entry });
});
