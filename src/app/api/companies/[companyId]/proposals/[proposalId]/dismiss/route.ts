import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { DismissProposalSchema } from "../../../../../../../contracts/api-scrapes";
import { readJob } from "../../../../../../../server/jobs";
export const POST = route(async (r, c, { client, user }) => {
  const b = await readJson(r, DismissProposalSchema);
  const p = await c.params;
  await rpc(client, "dismiss_proposal", {
    p_company: IdSchema.parse(p.companyId),
    p_job: b.jobId,
    p_proposal: IdSchema.parse(p.proposalId),
    p_reason: b.reason ?? null,
  });
  return readJob(client, p.companyId, b.jobId, user!.id);
});
