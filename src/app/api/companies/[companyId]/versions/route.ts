import { route, readJson, rpc } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { PublishSchema } from "../../../../../contracts/api-versions";
import { readVersionSummaries } from "../../../../../server/snapshots";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, PublishSchema);
  const saved = (await rpc(client, "publish_knowledge_base", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_expected_generation: b.expectedGeneration,
    p_request: b.requestId,
  })) as { id: string; version_number: number };
  return { versionId: saved.id, version: saved.version_number };
}, 201);
export const GET = route(async (_r, c, { client, user }) => {
  const company = IdSchema.parse((await c.params).companyId);
  return readVersionSummaries(client, company, user.id);
});
