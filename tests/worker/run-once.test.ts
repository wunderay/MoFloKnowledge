import { afterEach, expect, it, vi } from "vitest";
import type { Job, JobRepository } from "@/worker/job-repository";

type RunOnce = (
  repository: JobRepository,
  work: (job: Job, signal: AbortSignal) => Promise<void>,
  options: { workerId: string; budgetMs: number; now?: () => number },
) => Promise<{ status: string; jobId?: string }>;

async function loadRunOnce(): Promise<RunOnce> {
  const path = "@/worker/run-once";
  const mod = (await import(/* @vite-ignore */ path).catch(() => null)) as unknown as { runOnce?: RunOnce } | null;
  expect(mod, "run-once module exists").not.toBeNull();
  expect(typeof mod?.runOnce, "runOnce is exported").toBe("function");
  return mod!.runOnce!;
}

const job = { id: "job-1", company_id: "company-1", lease_token: "lease-1", status: "running" } as unknown as Job;

function fakeRepository(claimed: Job | null) {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    heartbeat: vi.fn().mockResolvedValue(job),
    fail: vi.fn().mockResolvedValue(job),
    release: vi.fn().mockResolvedValue(job),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
const asRepository = (fake: unknown) => fake as JobRepository;

afterEach(() => {
  vi.useRealTimers();
});

it("returns idle without running work when no job is claimable", async () => {
  const runOnce = await loadRunOnce();
  const repository = fakeRepository(null);
  const work = vi.fn();
  const result = await runOnce(asRepository(repository), work, { workerId: "w1", budgetMs: 1000 });
  expect(result).toEqual({ status: "idle" });
  expect(repository.claim).toHaveBeenCalledWith("w1");
  expect(work).not.toHaveBeenCalled();
});

it("runs one claimed job to completion and reports it finished", async () => {
  const runOnce = await loadRunOnce();
  const repository = fakeRepository(job);
  const work = vi.fn().mockResolvedValue(undefined);
  const result = await runOnce(asRepository(repository), work, { workerId: "w1", budgetMs: 1000 });
  expect(result).toEqual({ status: "finished", jobId: "job-1" });
  expect(work).toHaveBeenCalledWith(job, expect.any(AbortSignal));
  expect(repository.fail).not.toHaveBeenCalled();
  expect(repository.release).not.toHaveBeenCalled();
});

it("aborts with reason budget, releases the lease and does not fail the job when the budget elapses", async () => {
  vi.useFakeTimers();
  const runOnce = await loadRunOnce();
  const repository = fakeRepository(job);
  let reason: unknown;
  const work = vi.fn(
    (_job: Job, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reason = signal.reason;
          reject(new Error("aborted"));
        });
      }),
  );
  const pending = runOnce(asRepository(repository), work, { workerId: "w1", budgetMs: 5000 });
  await vi.advanceTimersByTimeAsync(5000);
  const result = await pending;
  expect(result).toEqual({ status: "paused", jobId: "job-1" });
  expect(reason).toBe("budget");
  expect(repository.release).toHaveBeenCalledWith(job);
  expect(repository.fail).not.toHaveBeenCalled();
});
