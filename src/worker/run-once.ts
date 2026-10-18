import { logError } from "../server/log";
import type { Job, JobRepository } from "./job-repository";
import { recordFailure, startHeartbeat } from "./run-loop";

export type RunOnceResult =
  | { status: "idle" }
  | { status: "finished" | "failed" | "paused"; jobId: string };

/**
 * Claims and runs one job for at most `budgetMs`. A job still running when the budget ends is paused, not failed:
 * its lease is released so the next call resumes it from its checkpoint.
 */
export async function runOnce(
  repository: JobRepository,
  work: (job: Job, signal: AbortSignal) => Promise<void>,
  options: { workerId: string; budgetMs: number; now?: () => number },
): Promise<RunOnceResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const job = await repository.claim(options.workerId);
  if (!job) {
    return { status: "idle" };
  }
  const attempt = new AbortController();
  const heartbeat = startHeartbeat(repository, job, attempt);
  const budget = setTimeout(() => {
    attempt.abort("budget");
  }, Math.max(0, options.budgetMs - (now() - startedAt)));
  try {
    await work(job, attempt.signal);
    return { status: "finished", jobId: job.id };
  } catch (error) {
    if (attempt.signal.reason === "budget" && !heartbeat.leaseLost()) {
      await repository.release(job).catch((releaseError: unknown) => {
        logError("could not release job", { jobId: job.id, error: releaseError });
      });
      return { status: "paused", jobId: job.id };
    }
    logError("job failed", { jobId: job.id, error });
    if (!heartbeat.leaseLost()) {
      await recordFailure(repository, job, error, attempt.signal.aborted);
    }
    return { status: "failed", jobId: job.id };
  } finally {
    clearTimeout(budget);
    heartbeat.stop();
  }
}
