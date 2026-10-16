import { route, readJson, rpc } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
export const runtime = "nodejs";
import { EnqueueSchema } from "../../../../../contracts/api-scrapes";
export const POST = route(async (r, c, { client }) => {
  const b = await readJson(r, EnqueueSchema);
  const job = await rpc(client, "enqueue_scrape", {
    p_company: IdSchema.parse((await c.params).companyId),
    p_url: b.url,
    p_options: {
      max_pages: b.options?.documentLimit ?? 10,
      max_depth: b.options?.depthLimit ?? 2,
    },
    p_request: b.requestId,
  });
  return { jobId: job.id, status: job.status };
}, 202);
