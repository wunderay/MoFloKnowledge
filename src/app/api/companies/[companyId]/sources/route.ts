import { route } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
import { readSourceCoverage } from "../../../../../server/source-coverage";
export const runtime = "nodejs";
export const GET = route(async (_request, context, { client, user }) =>
  readSourceCoverage(client, IdSchema.parse((await context.params).companyId), user!.id),
);
