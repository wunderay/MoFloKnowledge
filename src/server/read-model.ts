import "server-only";
import type { verifiedSession } from "../lib/supabase/server";
import { HttpError, mapDatabaseError } from "./http";
import { authorizeCompany } from "./authorize";
import { parseBusinessEntry, EntryProvenanceSchema } from "../contracts";
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
  return { ...company, role };
}
export async function readDraft(client: Client, id: string, userId: string) {
  const company = await readCompany(client, id, userId);
  const [entries, revisions, sources] = await Promise.all([
    checked(
      client
        .from("knowledge_entries")
        .select("*")
        .eq("company_id", id)
        .order("created_at")
        .order("id"),
    ),
    checked(
      client.from("knowledge_entry_versions").select("*").eq("company_id", id),
    ),
    checked(
      client
        .from("source_pages")
        .select(
          "id,company_id,scrape_job_id,normalized_url,final_url,title,author,site_name,published_on,retrieved_at,capture_status",
        )
        .eq("company_id", id),
    ),
  ]);
  const current = (entries ?? []).map((entry) => {
    const rev = (revisions ?? []).find(
      (r) => r.entry_id === entry.id && r.revision === entry.current_revision,
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
      content: parseBusinessEntry(entry.kind, rev.content),
      provenance: EntryProvenanceSchema.parse(rev.provenance),
    };
  });
  return {
    actorId: userId,
    company,
    draftGeneration: company.draft_generation,
    entries: current,
    sources,
  };
}
