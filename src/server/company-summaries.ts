import "server-only";
import type { verifiedSession } from "../lib/supabase/server";
import { parseResponse } from "./http";
import { CompanyListSchema } from "../contracts/api-responses";
import { checked } from "./read-model";
export async function readCompanySummaries(
  client: Awaited<ReturnType<typeof verifiedSession>>["client"],
  userId: string,
  options: { archived?: boolean; cursor?: string } = {},
) {
  let query = client.from("companies").select("*").order("id").limit(50);
  if (options.archived) {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }
  if (options.cursor) {
    query = query.gt("id", options.cursor);
  }
  const companies = (await checked(query)) ?? [];
  const result = [];
  for (const company of companies) {
    const [member, jobs, versions] = await Promise.all([
      checked(
        client
          .from("company_members")
          .select("role")
          .eq("company_id", company.id)
          .eq("user_id", userId)
          .single(),
      ),
      checked(
        client
          .from("scrape_jobs")
          .select("id,status,progress,created_at")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(1),
      ),
      checked(
        client
          .from("knowledge_base_versions")
          .select("id,version_number,created_at")
          .eq("company_id", company.id)
          .order("version_number", { ascending: false })
          .limit(1),
      ),
    ]);
    result.push({
      ...company,
      role: member?.role,
      latestJob: jobs?.[0] ?? null,
      latestVersion: versions?.[0] ?? null,
    });
  }
  return parseResponse(CompanyListSchema, {
    companies: result,
    nextCursor: companies.length === 50 ? companies.at(-1)!.id : null,
  });
}
