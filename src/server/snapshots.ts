import "server-only";
import { KnowledgeBaseExportSchema } from "../contracts";
import { upgradeLegacySnapshot } from "../knowledge/legacy-snapshot";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { VersionSummarySchema } from "../contracts/api-responses";
import { HttpError, parseResponse } from "./http";
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
  // `payload` is the validated, current-shape view for rendering; `stored` is exactly what was frozen (hash, downloads).
  return { ...saved, payload: KnowledgeBaseExportSchema.parse(upgradeLegacySnapshot(saved.payload)), stored: saved.payload as unknown };
}

export async function readVersionSummaries(
  client: Awaited<ReturnType<typeof verifiedSession>>["client"],
  companyId: string,
  userId: string,
) {
  await authorizeCompany(client, companyId, userId);
  const pages = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await checked(
      client
        .from("knowledge_base_versions")
        .select(
          "id,version_number,schema_version,author_id,created_at,payload_sha256",
        )
        .eq("company_id", companyId)
        .order("version_number", { ascending: false })
        .range(offset, offset + 999),
    );
    pages.push(...(page ?? []));
    if ((page ?? []).length < 1000) break;
  }
  return parseResponse(VersionSummarySchema.array(), pages);
}
