import { route, parseResponse } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { authorizeCompany } from "../../../../../../../server/authorize";
import { checked } from "../../../../../../../server/read-model";
import { HistoryRevisionResponseSchema } from "../../../../../../../contracts/api-responses";
import { readCitationContext } from "../../../../../../../server/citation-context";
import { EntryProvenanceSchema } from "../../../../../../../contracts";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  const company = IdSchema.parse(p.companyId);
  await authorizeCompany(client, company, user!.id);
  const revisions = await checked(
    client
      .from("knowledge_entry_versions")
      .select("*")
      .eq("company_id", company)
      .eq("entry_id", IdSchema.parse(p.entryId))
      .order("revision", { ascending: false }),
  );
  return parseResponse(
    HistoryRevisionResponseSchema.array(),
    await Promise.all(
      (revisions ?? []).map(async (revision) => ({
        ...revision,
        citationContext: await readCitationContext(client, company, [
          EntryProvenanceSchema.parse(revision.provenance),
        ]),
      })),
    ),
  );
});
