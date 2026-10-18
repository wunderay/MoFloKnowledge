import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    client: { rpc: state.rpc, from: state.from },
  }),
}));
import { GET, POST } from "../../src/app/api/companies/route";
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

it("lists only id and name with one query when asked for the minimal fields", async () => {
  const select = vi.fn();
  const query: Record<string, unknown> = {};
  for (const method of ["is", "order", "limit"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.select = select.mockReturnValue(query);
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Acme" }], error: null }).then(resolve);
  state.from.mockReturnValue(query);
  const response = await GET(new Request("https://app.example/api/companies?fields=min"), { params: Promise.resolve({}) });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({ companies: [{ id: "33333333-3333-4333-8333-333333333333", name: "Acme" }] });
  expect(state.from).toHaveBeenCalledTimes(1);
  expect(select).toHaveBeenCalledWith("id,name");
});
