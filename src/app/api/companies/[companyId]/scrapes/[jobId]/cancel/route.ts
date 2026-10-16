import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { z } from "zod";
export const POST = route(async (r, c, { client }) => {
  await readJson(r, z.object({}).strict());
  const p = await c.params;
  return rpc(client, "cancel_scrape", {
    p_company: IdSchema.parse(p.companyId),
    p_job: IdSchema.parse(p.jobId),
  });
});
