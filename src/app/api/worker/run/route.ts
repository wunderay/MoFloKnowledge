import { randomUUID, timingSafeEqual } from "node:crypto";
import { PostgresJobRepository } from "../../../../worker/job-repository";
import { runOnce } from "../../../../worker/run-once";
import { runCrawl } from "../../../../worker/crawl/run-crawl";
import { extractAndFinish } from "../../../../worker/extract/pipeline";
import { kickWorker } from "../../../../server/kick-worker";
import { logError } from "../../../../server/log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Stops the attempt well inside maxDuration so the lease can be released and the response sent.
const BUDGET_MS = 240_000;

/** This route has no user session: it is reachable only with the bearer secret Vercel cron sends. */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function failure(status: number, code: string, message: string, requestId: string) {
  return Response.json(
    { data: null, error: { code, message }, requestId },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handle(request: Request) {
  const requestId = randomUUID();
  if (!authorized(request)) {
    return failure(401, "unauthorized", "Not authorized.", requestId);
  }
  const connectionString = process.env.WORKER_DATABASE_URL;
  if (!connectionString) {
    logError("WORKER_DATABASE_URL is not configured", { requestId });
    return failure(503, "unavailable", "The worker is not configured.", requestId);
  }
  const repository = new PostgresJobRepository({ connectionString });
  try {
    const result = await runOnce(
      repository,
      async (job, signal) => {
        const crawl = await runCrawl(job, repository, signal);
        await extractAndFinish(job, repository, crawl, signal);
      },
      { workerId: randomUUID(), budgetMs: BUDGET_MS },
    );
    if (result.status !== "idle") {
      kickWorker();
    }
    return Response.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("worker run failed", { requestId, error });
    return failure(503, "unavailable", "The worker could not run.", requestId);
  } finally {
    await repository.close();
  }
}

export const GET = handle;
export const POST = handle;
