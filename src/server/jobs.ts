import "server-only";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { HttpError } from "./http";
import type { verifiedSession } from "../lib/supabase/server";
export async function readJob(
  client: Awaited<ReturnType<typeof verifiedSession>>["client"],
  company: string,
  id: string,
  user: string,
) {
  await authorizeCompany(client, company, user);
  const job = await checked(
    client
      .from("scrape_jobs")
      .select(
        "id,company_id,status,progress,errors,proposals,cancel_requested_at,created_at,updated_at",
      )
      .eq("company_id", company)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!job) throw new HttpError(404, "unavailable", "Resource unavailable.");
  return job;
}
