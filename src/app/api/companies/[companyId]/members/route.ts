import { route } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
import { checked } from "../../../../../server/read-model";
import { authorizeCompany } from "../../../../../server/authorize";
export const runtime = "nodejs";
export const GET = route(async (_request, context, { client, user }) => {
  const company = IdSchema.parse((await context.params).companyId);
  await authorizeCompany(client, company, user!.id);
  return checked(
    client
      .from("company_members")
      .select("user_id,role,created_at")
      .eq("company_id", company)
      .order("created_at"),
  );
});
