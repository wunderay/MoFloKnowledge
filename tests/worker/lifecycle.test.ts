import { afterEach, expect, it, vi } from "vitest";
import { runWorker } from "../../src/worker/run-loop";
import type { Job, JobRepository } from "../../src/worker/job-repository";
const job = {
  id: "11111111-1111-4111-8111-111111111111",
  company_id: "22222222-2222-4222-8222-222222222222",
  lease_token: "33333333-3333-4333-8333-333333333333",
} as Job;
afterEach(() => vi.useRealTimers());
it("aborts superseded attempts and never calls terminal write with stale authority", async () => {
  vi.useFakeTimers();
  const stop = new AbortController();
  const fail = vi.fn();
  const heartbeat = vi.fn().mockRejectedValue(new Error("lease_lost"));
  const repository = {
    claim: vi.fn().mockResolvedValueOnce(job),
    heartbeat,
    fail,
  } as unknown as JobRepository;
  const work = vi.fn(
    async (_j: Job, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ),
  );
  const running = runWorker(repository, work, {
    workerId: "worker-test",
    signal: stop.signal,
    onEvent: (event) => {
      if (event.event === "lease_lost") stop.abort();
    },
  });
  await vi.advanceTimersByTimeAsync(15000);
  await running;
  expect(heartbeat).toHaveBeenCalledWith(job);
  expect(fail).not.toHaveBeenCalled();
  expect(work).toHaveBeenCalledTimes(1);
});
