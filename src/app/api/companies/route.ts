import { route, readJson, rpc } from "../../../server/http";
import { IdSchema } from "../../../contracts/api-common";
export const runtime = "nodejs";
import { CreateCompanySchema } from "../../../contracts/api-companies";
import { checked } from "../../../server/read-model";
export const POST = route(async (request, _context, { client }) => {
  const b = await readJson(request, CreateCompanySchema);
  return {
    companyId: await rpc(client, "create_company", {
      p_name: b.name,
      p_website: b.website,
      p_request: b.requestId,
    }),
    role: "owner",
  };
}, 201);
export const GET = route(async (request, _context, { client, user }) => {
  const url = new URL(request.url);
  if (
    [...url.searchParams.keys()].some(
      (k) => !["cursor", "archived"].includes(k),
    )
  )
    throw new Error("invalid_query");
  const cursor = url.searchParams.get("cursor");
  if (cursor) IdSchema.parse(cursor);
  let query = client.from("companies").select("*").order("id").limit(50);
  if (url.searchParams.get("archived") === "true")
    query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);
  if (cursor) query = query.gt("id", cursor);
  const companies = (await checked(query)) ?? [];
  const result = [];
  for (const company of companies) {
    const [member, jobs, versions] = await Promise.all([
      checked(
        client
          .from("company_members")
          .select("role")
          .eq("company_id", company.id)
          .eq("user_id", user!.id)
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
  return {
    companies: result,
    nextCursor: companies.length === 50 ? companies.at(-1)!.id : null,
  };
});
