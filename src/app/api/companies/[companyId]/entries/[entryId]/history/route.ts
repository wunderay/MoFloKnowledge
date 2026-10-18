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
  await authorizeCompany(client, company, user.id);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
      (revisions ?? []).map(async (revision) => ({
        ...revision,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-member-access -- entry is checked above; rows are untyped (see the first disable)
        content: parseStoredEntry(entry!.kind as EntryKind, revision.content),
        citationContext: await readCitationContext(client, company, [
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use
          EntryProvenanceSchema.parse(revision.provenance),
        ]),
      })),
    ),
  );
});
