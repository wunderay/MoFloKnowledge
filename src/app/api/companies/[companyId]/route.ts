import { route, readJson, rpc } from "../../../../server/http";
import { IdSchema } from "../../../../contracts/api-common";
export const runtime = "nodejs";
import { readCompany } from "../../../../server/read-model";
import { UpdateCompanySchema } from "../../../../contracts/api-companies";
export const GET = route(async (_r, c, { client, user }) =>
  readCompany(client, IdSchema.parse((await c.params).companyId), user.id),
);
export const PATCH = route(async (r, c, { client }) => {
  const b = await readJson(r, UpdateCompanySchema);
  return rpc(client, "update_company", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_expected_generation: b.expectedGeneration,
    p_name: b.name ?? null,
    p_website: b.website ?? null,
  });
});
