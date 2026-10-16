import { route } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readDraft } from "../../../../../server/read-model";
export const GET = route(async (_r, c, { client, user }) =>
  readDraft(client, IdSchema.parse((await c.params).companyId), user!.id),
);
