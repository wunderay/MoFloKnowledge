import { route, readJson, rpc, HttpError } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { EnqueueSchema } from "../../../../../contracts/api-scrapes";
import { kickWorker } from "../../../../../server/kick-worker";
import { normalizeUrl } from "../../../../../worker/network/url-scope";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, EnqueueSchema);
  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(b.url);
  } catch {
    throw new HttpError(
      422,
      "invalid_url",
      "Use a public HTTP(S) company hostname.",
    );
  }
  const job = (await rpc(client, "enqueue_scrape", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_url: normalizedUrl,
    p_options: {
      max_pages: b.options?.documentLimit ?? 10,
      max_depth: b.options?.depthLimit ?? 2,
    },
    p_request: b.requestId,
  })) as { id: string; status: string };
  kickWorker();
  return { jobId: job.id, status: job.status };
}, 202);
