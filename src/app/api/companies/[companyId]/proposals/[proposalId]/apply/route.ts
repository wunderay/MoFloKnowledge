import { route, readJson, rpc } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { ApplyProposalSchema } from "../../../../../../../contracts/api-scrapes";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, ApplyProposalSchema);
  const p = await c.params;
  return rpc(client, "apply_proposal", {
    p_company: IdSchema.parse(p.companyId),
    p_job: b.jobId,
    p_proposal: IdSchema.parse(p.proposalId),
    p_entry: b.entryId ?? null,
    p_expected_revision: b.expectedRevision ?? null,
    p_selected_candidate_ids: b.selectedCandidateIds,
    p_request: b.requestId,
  });
});
