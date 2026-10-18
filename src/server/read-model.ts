/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use */
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
  if (error) {
    throw mapDatabaseError(error);
  }
  return data;
}
export async function readCompany(client: Client, id: string, userId: string) {
  const role = await authorizeCompany(client, id, userId);
  const company = await checked(
    client.from("companies").select("*").eq("id", id).maybeSingle(),
  );
  if (!company) {
    throw new HttpError(404, "unavailable", "Resource unavailable.");
  }
  return parseResponse(CompanyReadSchema, { ...company, role });
}
export async function readDraft(client: Client, id: string, userId: string) {
  const company = await readCompany(client, id, userId);
  const entries = await checked(
    client
      .from("knowledge_entries")
      // Deleted entries are hidden from the caller by row security; the tombstone columns are never part of a draft.
      .select("id,company_id,kind,current_revision,created_by,created_at")
      .eq("company_id", id)
      .order("created_at")
      .order("id"),
  );
  const revisions = entries?.length
    ? await checked(
        client
          .from("knowledge_entry_versions")
          .select("*")
          .eq("company_id", id)
          .in("entry_id", entries.map((entry) => entry.id))
          .in("revision", [...new Set(entries.map((entry) => entry.current_revision))]),
      )
    : [];
  const byEntry = new Map(
    (revisions ?? []).map((rev) => [`${rev.entry_id}:${rev.revision}`, rev]),
  );
  const current = (entries ?? []).map((entry) => {
    const rev = byEntry.get(`${entry.id}:${entry.current_revision}`);
    if (!rev) {
      throw new HttpError(
        503,
        "invalid_state",
        "Draft is temporarily unavailable.",
      );
    }
    return {
      ...entry,
      ...rev,
      id: entry.id,
      created_at: entry.created_at,
      saved_at: rev.created_at,
      content: parseStoredEntry(entry.kind, rev.content),
      provenance: EntryProvenanceSchema.parse(rev.provenance),
    };
  });
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
