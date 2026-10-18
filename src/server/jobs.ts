/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use */
import { crawlLimits } from "@/lib/config/crawl-limits";
import "server-only";
import { authorizeCompany } from "./authorize";
import { checked } from "./read-model";
import { JobResponseSchema } from "../contracts/api-responses";
import { EntryKindSchema, withAddedFields } from "../contracts/business";
import { HttpError, parseResponse } from "./http";
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
        "id,company_id,status,progress,errors,proposals,cancel_requested_at,created_at,updated_at,options",
      )
      .eq("company_id", company)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!job) {
    throw new HttpError(404, "unavailable", "Resource unavailable.");
  }
  const { options, ...safeJob } = job;
  const proposals = job.proposals ?? {};
  return parseResponse(JobResponseSchema, {
    ...safeJob,
    progress: {
      discovered: 0,
      selected: 0,
      captured: 0,
      failed: 0,
      blocked: 0,
      extracted: 0,
      document_limit: options?.max_pages ?? crawlLimits().defaultPages,
      limits_reached: [],
      ...job.progress,
      stage: job.status,
    },
    proposals: {
      // Candidates stored before the model fields existed omit them; they read as defaults.
      candidates: (proposals.candidates ?? []).map(
        (candidate: { kind?: unknown; content?: unknown }) => {
          const kind = EntryKindSchema.safeParse(candidate?.kind);
          return kind.success
            ? { ...candidate, content: withAddedFields(kind.data, candidate.content) }
            : candidate;
        },
      ),
      decisions: proposals.decisions ?? [],
      coverage: proposals.coverage ?? [],
      initialized_entry_ids: proposals.initialized_entry_ids ?? [],
    },
  });
}
