// OWASP Top 10:2025 A09 Security Logging & Alerting Failures.
// The worker emits events as JSON lines on stdout (src/worker/main.ts), unexpected server errors are written as JSON
// lines on stderr by src/server/log.ts, and the web tier returns a requestId with every response. These tests check that the events
// that exist are structured, say what happened to which job, and never carry the error text or secrets.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runWorker } from "../../../src/worker/run-loop";
import type { Job, JobRepository } from "../../../src/worker/job-repository";

// secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- intentionally fake credential: the test asserts it never reaches the logs
const SECRET = "postgres://worker:hunter2@db.internal:5432/app";
const ROOT = resolve(__dirname, "../../..");

function run(repository: Partial<JobRepository>, work: () => Promise<void>) {
  const events: Record<string, unknown>[] = [];
  const stop = new AbortController();
  const done = runWorker(repository as JobRepository, work, {
    workerId: "worker-test",
    signal: stop.signal,
    idleMs: 1,
    onEvent: (event) => {
      events.push(event);
      if (["job_stopped", "job_finished", "claim_unavailable"].includes(String(event.event))) {
        stop.abort();
      }
    },
  });
  return { events, done };
}

describe("worker events", () => {
  it("record each job's start and failure by id, and store a fixed failure message, not the error text", async () => {
    const job = { id: "job-1", company_id: "c-1" } as Job;
    const fail = vi.fn().mockResolvedValue(job);
    const { events, done } = run({ claim: vi.fn().mockResolvedValue(job), fail }, async () => {
      throw new Error(`connect failed ${SECRET}`);
    });
    await done;
    expect(events.map((event) => event.event)).toEqual(["job_started", "job_stopped"]);
    expect(events.every((event) => event.jobId === "job-1")).toBe(true);
    expect(fail).toHaveBeenCalledOnce();
    expect(fail.mock.calls[0][1]).toMatchObject({ code: "worker_failure", message: "The worker could not complete the job." });
    expect(JSON.stringify([events, fail.mock.calls])).not.toContain("hunter2");
  });

  it("report an unreachable job queue as an event without the driver's message", async () => {
    const { events, done } = run({ claim: vi.fn().mockRejectedValue(new Error(SECRET)) }, async () => {});
    await done;
    expect(events).toEqual([{ event: "claim_unavailable" }]);
  });
});

describe("source tree", () => {
  it("has no ad-hoc console logging outside src/server/log.ts that could print request data or secrets", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    for (const path of sources(join(ROOT, "src")).filter((file) => !file.endsWith(join("server", "log.ts")))) {
      expect(readFileSync(path, "utf8"), path.slice(ROOT.length + 1)).not.toMatch(/console\.(log|info|debug|warn|error)\(/);
    }
  });
});
