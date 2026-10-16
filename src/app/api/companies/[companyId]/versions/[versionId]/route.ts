import { route } from "../../../../../../server/http";
import { IdSchema } from "../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readSnapshot } from "../../../../../../server/snapshots";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  const saved = await readSnapshot(
    client,
    IdSchema.parse(p.companyId),
    IdSchema.parse(p.versionId),
    user!.id,
  );
  return saved.payload;
});
