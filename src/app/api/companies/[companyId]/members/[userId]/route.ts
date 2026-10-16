import { route, readJson, rpc } from "../../../../../../server/http";
import { IdSchema } from "../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { MemberSchema } from "../../../../../../contracts/api-companies";
import { checked } from "../../../../../../server/read-model";
export const PUT = route(async (r, c, { client }) => {
  const b = await readJson(r, MemberSchema);
  const p = await c.params;
  const company = IdSchema.parse(p.companyId);
  await rpc(client, "set_company_member", {
    p_company: company,
    p_user: IdSchema.parse(p.userId),
    p_role: "role" in b ? b.role : null,
  });
  return checked(
    client.from("company_members").select("*").eq("company_id", company),
  );
});
