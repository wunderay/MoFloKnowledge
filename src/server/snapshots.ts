import "server-only";
import { KnowledgeBaseExportSchema } from "../contracts";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { HttpError } from "./http";
import type { verifiedSession } from "../lib/supabase/server";
export async function readSnapshot(
  client: Awaited<ReturnType<typeof verifiedSession>>["client"],
  company: string,
  id: string,
  user: string,
) {
  await authorizeCompany(client, company, user);
  const saved = await checked(
    client
      .from("knowledge_base_versions")
      .select("*")
      .eq("company_id", company)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!saved) throw new HttpError(404, "unavailable", "Resource unavailable.");
  return { ...saved, payload: KnowledgeBaseExportSchema.parse(saved.payload) };
}
