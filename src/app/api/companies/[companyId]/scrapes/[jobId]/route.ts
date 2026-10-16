import { route } from "../../../../../../server/http";
import { IdSchema } from "../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readJob } from "../../../../../../server/jobs";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  return readJob(
    client,
    IdSchema.parse(p.companyId),
    IdSchema.parse(p.jobId),
    user!.id,
  );
});
