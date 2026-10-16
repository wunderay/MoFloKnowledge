import { route, readJson, rpc } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { ArchiveCompanySchema } from "../../../../../contracts/api-companies";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, ArchiveCompanySchema);
  return rpc(client, "archive_company", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_expected_generation: b.expectedGeneration,
  });
});
