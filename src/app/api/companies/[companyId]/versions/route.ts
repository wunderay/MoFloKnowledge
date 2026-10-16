import { route, readJson, rpc } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { PublishSchema } from "../../../../../contracts/api-versions";
import { checked } from "../../../../../server/read-model";
import { authorizeCompany } from "../../../../../server/authorize";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, PublishSchema);
  const saved = await rpc(client, "publish_knowledge_base", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_expected_generation: b.expectedGeneration,
    p_request: b.requestId,
  });
  return { versionId: saved.id, version: saved.version_number };
}, 201);
export const GET = route(async (_r, c, { client, user }) => {
  const company = IdSchema.parse((await c.params).companyId);
  await authorizeCompany(client, company, user!.id);
  return checked(
    client
      .from("knowledge_base_versions")
      .select(
        "id,version_number,schema_version,author_id,created_at,payload_sha256",
      )
      .eq("company_id", company)
      .order("version_number", { ascending: false }),
  );
});
