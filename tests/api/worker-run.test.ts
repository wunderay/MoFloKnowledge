import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  runOnce: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/worker/run-once", () => ({ runOnce: state.runOnce }));
vi.mock("@/worker/job-repository", () => ({
  PostgresJobRepository: class {
    close = state.close;
  },
}));

const SECRET = "cron-secret-for-test";
type Handler = (request: Request) => Promise<Response>;

async function loadGet(): Promise<Handler> {
  const path = "@/app/api/worker/run/route";
  const mod = (await import(/* @vite-ignore */ path).catch(() => null)) as unknown as { GET?: Handler } | null;
  expect(mod, "worker run route exists").not.toBeNull();
  expect(typeof mod?.GET, "GET is exported").toBe("function");
  return mod!.GET!;
}
const call = (get: Handler, authorization?: string) =>
  get(
    new Request("https://app.example/api/worker/run", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.WORKER_DATABASE_URL = "postgres://worker@localhost/db";
  state.runOnce.mockReset().mockResolvedValue({ status: "idle" });
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.WORKER_DATABASE_URL;
});

it("rejects a request without a bearer token with 401 and never runs work", async () => {
  const get = await loadGet();
  const response = await call(get);
  expect(response.status).toBe(401);
  expect(state.runOnce).not.toHaveBeenCalled();
});

it("rejects a wrong bearer token with 401 and never runs work", async () => {
  const get = await loadGet();
  const response = await call(get, "Bearer not-the-secret");
  expect(response.status).toBe(401);
  expect(state.runOnce).not.toHaveBeenCalled();
});

it("runs one job with the right bearer and returns the result as data", async () => {
  const get = await loadGet();
  const response = await call(get, `Bearer ${SECRET}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { status: "idle" } });
  expect(state.runOnce).toHaveBeenCalledTimes(1);
  expect(state.runOnce.mock.calls[0]?.[2]).toMatchObject({ budgetMs: 240000 });
});
