import { route } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { authorizeCompany } from "../../../../../../../server/authorize";
import { checked } from "../../../../../../../server/read-model";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  const company = IdSchema.parse(p.companyId);
  await authorizeCompany(client, company, user!.id);
  return checked(
    client
      .from("knowledge_entry_versions")
      .select("*")
      .eq("company_id", company)
      .eq("entry_id", IdSchema.parse(p.entryId))
      .order("revision", { ascending: false }),
  );
});
