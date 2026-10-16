import { route } from "../../../../../../server/http";
import { IdSchema } from "../../../../../../contracts/api-common";
import { readSourceCapture } from "../../../../../../server/source-coverage";
export const runtime = "nodejs";
export const GET = route(async (_request, context, { client, user }) => {
  const params = await context.params;
  return readSourceCapture(client, IdSchema.parse(params.companyId), IdSchema.parse(params.sourceId), user!.id);
});
