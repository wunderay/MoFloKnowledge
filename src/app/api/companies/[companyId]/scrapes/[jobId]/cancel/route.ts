import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { z } from "zod";
import { readJob } from "../../../../../../../server/jobs";
export const POST = route(async (r, c, { client, user }) => {
  await readJson(r, z.object({}).strict());
  const p = await c.params;
  await rpc(client, "cancel_scrape", {
    p_company: IdSchema.parse(p.companyId),
    p_job: IdSchema.parse(p.jobId),
  });
  return readJob(client, p.companyId, p.jobId, user.id);
});
