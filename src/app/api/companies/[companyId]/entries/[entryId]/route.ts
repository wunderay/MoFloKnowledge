import { route, readJson, rpc } from "../../../../../../server/http";
import { IdSchema } from "../../../../../../contracts/api-common";
import { DeleteEntrySchema } from "../../../../../../contracts/api-entries";
import { authorizeCompany } from "../../../../../../server/authorize";
export const runtime = "nodejs";

/**
 * Deletes a key person or an offering from the draft. The entry is archived, not erased: its revisions stay,
 * saved versions keep it, and it no longer appears in the draft, the next version or any export.
 */
export const DELETE = route(async (r, c, { client, user }) => {
  const p = await c.params;
  const company = IdSchema.parse(p.companyId);
  const entry = IdSchema.parse(p.entryId);
  // Membership and role first: a non-member or viewer learns nothing about the body rules.
  await authorizeCompany(client, company, user.id, true);
  const b = await readJson(r, DeleteEntrySchema);
  return rpc(client, "archive_entry", {
    p_company: company,
    p_entry: entry,
    p_expected_revision: b.expectedRevision,
    p_request: b.requestId,
  });
});
