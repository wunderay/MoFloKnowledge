import "server-only";
import type { verifiedSession } from "../lib/supabase/server";
import { HttpError, mapDatabaseError, parseResponse } from "./http";
import {
  CompanyReadSchema,
  DraftResponseSchema,
} from "../contracts/api-responses";
import { authorizeCompany } from "./authorize";
import { parseStoredEntry, EntryProvenanceSchema } from "../contracts";
import { readCitationContext } from "./citation-context";
type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];
export async function checked<T>(
  query: PromiseLike<{
    data: T;
    error: { message: string; code?: string } | null;
  }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw mapDatabaseError(error);
  return data;
}
export async function readCompany(client: Client, id: string, userId: string) {
  const role = await authorizeCompany(client, id, userId);
  const company = await checked(
    client.from("companies").select("*").eq("id", id).maybeSingle(),
  );
  if (!company)
    throw new HttpError(404, "unavailable", "Resource unavailable.");
  return parseResponse(CompanyReadSchema, { ...company, role });
}
export async function readDraft(client: Client, id: string, userId: string) {
  const company = await readCompany(client, id, userId);
  const entries = await checked(
    client
      .from("knowledge_entries")
      .select("*")
      .eq("company_id", id)
      .order("created_at")
      .order("id"),
  );
  const current = await Promise.all(
    (entries ?? []).map(async (entry) => {
      const rev = await checked(
        client
          .from("knowledge_entry_versions")
          .select("*")
          .eq("company_id", id)
          .eq("entry_id", entry.id)
          .eq("revision", entry.current_revision)
          .maybeSingle(),
      );
      if (!rev)
        throw new HttpError(
          503,
          "invalid_state",
          "Draft is temporarily unavailable.",
        );
      return {
        ...entry,
        ...rev,
        id: entry.id,
        created_at: entry.created_at,
        saved_at: rev.created_at,
        content: parseStoredEntry(entry.kind, rev.content),
        provenance: EntryProvenanceSchema.parse(rev.provenance),
      };
    }),
  );
  const sourceIds = [
    ...new Set(
      current.flatMap((entry) =>
        entry.provenance.sources.map((source: { id: string }) => source.id),
      ),
    ),
  ];
  const sources = sourceIds.length
    ? await checked(
        client
          .from("source_pages")
          .select(
            "id,company_id,scrape_job_id,normalized_url,final_url,title,author,site_name,published_on,retrieved_at,capture_status",
          )
          .eq("company_id", id)
          .in("id", sourceIds),
      )
    : [];
  return parseResponse(DraftResponseSchema, {
    actorId: userId,
    company,
    draftGeneration: company.draft_generation,
    entries: current,
    sources: sources ?? [],
    citationContext: await readCitationContext(
      client,
      id,
      current.map((entry) => entry.provenance),
    ),
  });
}
