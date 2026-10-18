import { setTimeout as delay } from "node:timers/promises";
import { logError } from "../server/log";
import type { SafeJobError } from "../contracts";
import type { Job, JobRepository } from "./job-repository";

/** Keeps the lease alive while a job runs; stops the attempt when the job is cancelled or the lease is lost. */
function startHeartbeat(repository: JobRepository, job: Job, attempt: AbortController) {
  let heartbeating = false;
  let leaseLost = false;
  const timer = setInterval(() => {
    if (heartbeating || attempt.signal.aborted) {
      return;
    }
    heartbeating = true;
    repository
      .heartbeat(job)
      .then((current) => {
        if (current.cancel_requested_at || current.status === "cancelled") {
          attempt.abort("cancelled");
        }
      })
      .catch(() => {
        leaseLost = true;
        attempt.abort("lease_lost");
      })
      .finally(() => {
        heartbeating = false;
      });
  }, 15000);
  return { leaseLost: () => leaseLost, stop: () => { clearInterval(timer); } };
}

/** The fixed, safe failure recorded for a job whose attempt threw. */
function recordFailure(repository: JobRepository, job: Job, error: unknown, cancelled: boolean, timedOut: boolean) {
  const policy = (error as { code?: string } | null)?.code === "NETWORK_POLICY";
  const safe: SafeJobError = {
    code: timedOut ? "timeout" : cancelled ? "cancelled" : policy ? "website_policy" : "worker_failure",
    url: null,
    retryable: false,
    message: timedOut
      ? "The crawl took too long and was stopped."
      : cancelled
      ? "Job was cancelled."
      : policy
        ? "The website or redirect did not pass the public website policy."
        : "The worker could not complete the job.",
  };
  return repository.fail(job, safe).catch((failError: unknown) => {
    logError("could not record job failure", { jobId: job.id, error: failError });
  });
}

const MINUTE_MS = 60_000;

/** Hard wall-clock limit for one job (crawl and extraction): WORKER_JOB_TIMEOUT_MS, default 10 minutes, clamped to 1-30 minutes. */
function jobTimeoutMs() {
  const configured = Number(process.env.WORKER_JOB_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(30 * MINUTE_MS, Math.max(MINUTE_MS, configured))
    : 10 * MINUTE_MS;
}

export async function runWorker(
  repository: JobRepository,
  work: (job: Job, signal: AbortSignal) => Promise<void>,
  options: {
    workerId: string;
    signal: AbortSignal;
    idleMs?: number;
    onEvent?: (event: Record<string, unknown>) => void;
  },
) {
  while (!options.signal.aborted) {
    let job: Job | null;
    try {
      job = await repository.claim(options.workerId);
    } catch (error) {
      logError("job claim failed", { error });
      options.onEvent?.({ event: "claim_unavailable" });
      await delay(options.idleMs ?? 2000, undefined, {
        signal: options.signal,
      }).catch(() => undefined);
      continue;
    }
    if (!job) {
      await delay(options.idleMs ?? 2000, undefined, {
        signal: options.signal,
      }).catch(() => undefined);
      continue;
    }
    const attempt = new AbortController();
    const stop = () => { attempt.abort(options.signal.reason); };
    options.signal.addEventListener("abort", stop, { once: true });
    const heartbeat = startHeartbeat(repository, job, attempt);
    let timedOut = false;
    const limit = setTimeout(() => {
      timedOut = true;
      attempt.abort("timeout");
    }, jobTimeoutMs());
    try {
      options.onEvent?.({ event: "job_started", jobId: job.id });
      await work(job, attempt.signal);
      options.onEvent?.({ event: "job_finished", jobId: job.id });
    } catch (error) {
      logError("job failed", { jobId: job.id, error });
      if (!heartbeat.leaseLost() && !options.signal.aborted) {
        await recordFailure(repository, job, error, attempt.signal.aborted, timedOut);
      }
      options.onEvent?.({
        event: heartbeat.leaseLost() ? "lease_lost" : "job_stopped",
        jobId: job.id,
      });
    } finally {
      clearTimeout(limit);
      heartbeat.stop();
      options.signal.removeEventListener("abort", stop);
    }
  }
}
