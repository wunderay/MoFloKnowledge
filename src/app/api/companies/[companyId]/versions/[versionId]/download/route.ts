import { route } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readSnapshot } from "../../../../../../../server/snapshots";
import { canonicalStringify } from "../../../../../../../knowledge/canonical-json";
import { downloadFilename } from "../../../../../../../knowledge/download-name";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
  const saved = await readSnapshot(
    client,
    IdSchema.parse(p.companyId),
    IdSchema.parse(p.versionId),
    user.id,
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
  return new Response(canonicalStringify(saved.stored), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
      "Content-Disposition": `attachment; filename="${downloadFilename(saved.payload.provenance.company.name, saved.version_number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
