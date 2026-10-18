import { crawlLimits } from "@/lib/config/crawl-limits";
import { route, readJson, rpc } from "../../../server/http";
import { IdSchema } from "../../../contracts/api-common";
export const runtime = "nodejs";
import { CreateCompanySchema } from "../../../contracts/api-companies";
import { logError } from "../../../server/log";
export const POST = route(async (request, _context, { client }, requestId) => {
  const b = await readJson(request, CreateCompanySchema);
  const companyId = IdSchema.parse(
    await rpc(client, "create_company", {
      p_name: b.name,
      p_website: b.website,
      p_request: b.requestId,
    }),
  );
  return { companyId, role: "owner", jobId: await startFirstCrawl(client, companyId, b, requestId) };
}, 201);

/**
 * The crawl starts as soon as the company has a website. The company exists either way, so a failure here is only logged.
 * The website already passed WebsiteSchema (http(s), no credentials); the worker applies the full public-host policy when it crawls.
 */
async function startFirstCrawl(
  client: Parameters<typeof rpc>[0],
  companyId: string,
  b: { website: string; requestId: string },
  requestId: string,
) {
  try {
    const job = (await rpc(client, "enqueue_scrape", {
      p_company: companyId,
      p_url: b.website,
      p_options: { max_pages: crawlLimits().defaultPages, max_depth: crawlLimits().defaultDepth },
      p_request: b.requestId,
    })) as { id: string };
    return job.id;
  } catch (error) {
    logError("could not start the first crawl", { requestId, error });
    return null;
  }
}
import { z } from "zod";
import { readCompanyNames, readCompanySummaries } from "../../../server/company-summaries";
export const GET = route(async (request, _context, { client, user }) => {
  const query = z
    .object({
      cursor: IdSchema.optional(),
      archived: z.enum(["true", "false"]).optional(),
      fields: z.literal("min").optional(),
    })
    .strict()
    .parse(Object.fromEntries(new URL(request.url).searchParams));
  if (query.fields === "min") {
    return readCompanyNames(client);
  }
  return readCompanySummaries(client, user.id, {
    cursor: query.cursor,
    archived: query.archived === "true",
  });
});
