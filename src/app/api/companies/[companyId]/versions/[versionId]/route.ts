import { route } from "../../../../../../server/http";
import { IdSchema } from "../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readSnapshot } from "../../../../../../server/snapshots";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
  const saved = await readSnapshot(
    client,
    IdSchema.parse(p.companyId),
    IdSchema.parse(p.versionId),
    user.id,
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
  return saved.payload;
});
