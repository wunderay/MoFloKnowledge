import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    client: { rpc: state.rpc },
  }),
}));
import { POST } from "../../src/app/api/companies/route";
it("delegates atomic ownership with the authenticated client and sanitizes database errors", async () => {
  process.env.APP_ORIGIN = "https://app.example";
  state.rpc.mockResolvedValueOnce({
    data: "33333333-3333-4333-8333-333333333333",
    error: null,
  });
  const request = () =>
    new Request("https://app.example/api/companies", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Acme",
        website: "https://acme.example",
        requestId: "22222222-2222-4222-8222-222222222222",
      }),
    });
  const context = { params: Promise.resolve({}) };
  const created = await POST(request(), context);
  expect(created.status).toBe(201);
  expect((await created.json()).data.role).toBe("owner");
  expect(state.rpc).toHaveBeenCalledWith("create_company", {
    p_name: "Acme",
    p_website: "https://acme.example",
    p_request: "22222222-2222-4222-8222-222222222222",
  });
  state.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "connection failed password=secret" },
  });
  const failed = await POST(request(), context);
  expect(failed.status).toBe(503);
  expect(JSON.stringify(await failed.json())).not.toContain("secret");
});
