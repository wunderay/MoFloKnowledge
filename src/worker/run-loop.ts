import { setTimeout as delay } from "node:timers/promises";
import type { Job, JobRepository } from "./job-repository";
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
    } catch {
      options.onEvent?.({ event: "claim_unavailable" });
      await delay(options.idleMs ?? 2000, undefined, {
        signal: options.signal,
      }).catch(() => {});
      continue;
    }
    if (!job) {
      await delay(options.idleMs ?? 2000, undefined, {
        signal: options.signal,
      }).catch(() => {});
      continue;
    }
    const attempt = new AbortController();
    const stop = () => attempt.abort(options.signal.reason);
    options.signal.addEventListener("abort", stop, { once: true });
    let heartbeating = false;
    let leaseLost = false;
    const timer = setInterval(() => {
      if (heartbeating || attempt.signal.aborted) return;
      heartbeating = true;
      repository
        .heartbeat(job!)
        .then((current) => {
          if (current.cancel_requested_at || current.status === "cancelled")
            attempt.abort("cancelled");
        })
        .catch(() => {
          leaseLost = true;
          attempt.abort("lease_lost");
        })
        .finally(() => {
          heartbeating = false;
        });
    }, 15000);
    try {
      options.onEvent?.({ event: "job_started", jobId: job.id });
      await work(job, attempt.signal);
      options.onEvent?.({ event: "job_finished", jobId: job.id });
    } catch {
      if (!leaseLost && !options.signal.aborted) {
        await repository
          .fail(job, {
            code: attempt.signal.aborted ? "cancelled" : "worker_failure",
            url: null,
            retryable: false,
            message: attempt.signal.aborted
              ? "Job was cancelled."
              : "The worker could not complete the job.",
          })
          .catch(() => {});
      }
      options.onEvent?.({
        event: leaseLost ? "lease_lost" : "job_stopped",
        jobId: job.id,
      });
    } finally {
      clearInterval(timer);
      options.signal.removeEventListener("abort", stop);
    }
  }
}
