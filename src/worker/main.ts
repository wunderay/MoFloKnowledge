import { randomUUID } from "node:crypto";
import { PostgresJobRepository } from "./job-repository";
import { runWorker } from "./run-loop";
import { runCrawl } from "./crawl/run-crawl";
import { extractAndFinish } from "./extract/pipeline";
import { logError } from "../server/log";
import { createRendererClient } from "../renderer/client";
async function main() {
  const connectionString = process.env.WORKER_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Configure WORKER_DATABASE_URL for a dedicated restricted PostgreSQL login.",
    );
  }
  const repository = new PostgresJobRepository({ connectionString });
  const stop = new AbortController();
  const shutdown = () => { stop.abort("shutdown"); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  const render =
    process.env.RENDERER_URL && process.env.RENDERER_TOKEN
      ? createRendererClient({
          url: process.env.RENDERER_URL,
          token: process.env.RENDERER_TOKEN,
        })
      : undefined;
  try {
    await runWorker(
      repository,
      async (job, signal) => {
        const crawl = await runCrawl(job, repository, signal, render);
        await extractAndFinish(job, repository, crawl, signal);
      },
      {
        workerId: process.env.WORKER_ID ?? randomUUID(),
        signal: stop.signal,
        onEvent: (event) =>
          process.stdout.write(
            JSON.stringify({ ...event, time: new Date().toISOString() }) + "\n",
          ),
      },
    );
  } finally {
    await repository.close();
  }
}
main().catch((error: unknown) => {
  logError("worker stopped", { error });
  process.exitCode = 1;
});
