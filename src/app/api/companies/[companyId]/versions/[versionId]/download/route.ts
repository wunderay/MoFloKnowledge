import { route } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { readSnapshot } from "../../../../../../../server/snapshots";
import { canonicalStringify } from "../../../../../../../knowledge/canonical-json";
import { downloadFilename } from "../../../../../../../knowledge/download-name";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  const saved = await readSnapshot(
    client,
    IdSchema.parse(p.companyId),
    IdSchema.parse(p.versionId),
    user!.id,
  );
  return new Response(canonicalStringify(saved.payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadFilename(saved.payload.provenance.company.name, saved.version_number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
