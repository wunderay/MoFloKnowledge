import { route, parseResponse } from "../../../../../../../server/http";
import { IdSchema } from "../../../../../../../contracts/api-common";
export const runtime = "nodejs";
import { authorizeCompany } from "../../../../../../../server/authorize";
import { checked } from "../../../../../../../server/read-model";
import { HistoryRevisionResponseSchema } from "../../../../../../../contracts/api-responses";
import { readCitationContext } from "../../../../../../../server/citation-context";
import { EntryProvenanceSchema, parseStoredEntry, type EntryKind } from "../../../../../../../contracts";
export const GET = route(async (_r, c, { client, user }) => {
  const p = await c.params;
  const company = IdSchema.parse(p.companyId);
  await authorizeCompany(client, company, user!.id);
  // The entry first: a deleted (archived) entry is hidden from members, and so is its history.
  const entry = await checked(
    client
      .from("knowledge_entries")
      .select("kind")
      .eq("company_id", company)
      .eq("id", IdSchema.parse(p.entryId))
      .maybeSingle(),
  );
  const revisions = entry
    ? await checked(
        client
          .from("knowledge_entry_versions")
          .select("*")
          .eq("company_id", company)
          .eq("entry_id", IdSchema.parse(p.entryId))
          .order("revision", { ascending: false }),
      )
    : [];
  return parseResponse(
    HistoryRevisionResponseSchema.array(),
    await Promise.all(
      (revisions ?? []).map(async (revision) => ({
        ...revision,
        content: parseStoredEntry(entry!.kind as EntryKind, revision.content),
        citationContext: await readCitationContext(client, company, [
          EntryProvenanceSchema.parse(revision.provenance),
        ]),
      })),
    ),
  );
});
