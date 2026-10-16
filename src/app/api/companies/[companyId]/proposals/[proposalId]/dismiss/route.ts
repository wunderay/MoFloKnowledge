import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { DismissProposalSchema } from "../../../../../../../contracts/api-scrapes";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, DismissProposalSchema);
  const p = await c.params;
  return rpc(client, "dismiss_proposal", {
    p_company: IdSchema.parse(p.companyId),
    p_job: b.jobId,
    p_proposal: IdSchema.parse(p.proposalId),
    p_reason: b.reason ?? null,
  });
});
