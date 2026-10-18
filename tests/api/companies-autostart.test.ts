import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    client: { rpc: state.rpc, from: state.from },
  }),
}));
import { POST } from "../../src/app/api/companies/route";
it("enqueues a default scrape of the website after creating the company and returns its jobId", async () => {
  process.env.APP_ORIGIN = "https://app.example";
  state.rpc.mockImplementation((name: string) =>
    Promise.resolve(
      name === "create_company"
        ? { data: "33333333-3333-4333-8333-333333333333", error: null }
        : { data: { id: "44444444-4444-4444-8444-444444444444", status: "queued" }, error: null },
    ),
  );
  const response = await POST(
    new Request("https://app.example/api/companies", {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({
        name: "Acme",
        website: "https://acme.example",
        requestId: "22222222-2222-4222-8222-222222222222",
      }),
    }),
    { params: Promise.resolve({}) },
  );
  expect(response.status).toBe(201);
  expect(state.rpc).toHaveBeenCalledWith(
    "enqueue_scrape",
    expect.objectContaining({
      p_company: "33333333-3333-4333-8333-333333333333",
      p_url: expect.stringContaining("acme.example") as unknown,
      p_options: { max_pages: 10, max_depth: 2 },
    }),
  );
  expect((await response.json()).data.jobId).toBe("44444444-4444-4444-8444-444444444444");
});
