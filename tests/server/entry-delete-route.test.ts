// Q9 key-people, the server side of "Delete <person>": DELETE /api/companies/<company>/entries/<entry>.
// DECISION (coordinator): deleting is a soft delete done by the database (public.archive_entry, migration 0020, proven in
// tests/db/entry-delete.test.mjs). This file proves the route in front of it: origin, session, role, body and error mapping.
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { DELETE } from "../../src/app/api/companies/[companyId]/entries/[entryId]/route";
import { GET as draft } from "../../src/app/api/companies/[companyId]/draft/route";
import { DeleteEntrySchema } from "../../src/contracts/api-entries";

const ORIGIN = "https://app.example";
const company = "10000000-0000-4000-8000-0000000000a1";
const entry = "30000000-0000-4000-8000-0000000000a2";
const user = "40000000-0000-4000-8000-0000000000a3";
const request = "50000000-0000-4000-8000-0000000000a4";
const archived = { id: entry, kind: "key_person", revision: 3, archived_at: "2026-10-17T10:00:00.000Z" };
const params = (over: Record<string, string> = {}) => ({ params: Promise.resolve({ companyId: company, entryId: entry, ...over }) });
const del = (body: unknown, init: { origin?: string | null; type?: string | null; raw?: string } = {}) =>
  new Request(`${ORIGIN}/api/companies/${company}/entries/${entry}`, {
    method: "DELETE",
    headers: {
      ...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }),
      ...(init.type === null ? {} : { "content-type": init.type ?? "application/json" }),
    },
    body: init.raw ?? JSON.stringify(body),
  });
const good = { expectedRevision: 3, requestId: request };

type Rpc = { data: unknown; error: { message: string; details?: string; code?: string } | null };
function session(role: "owner" | "editor" | "viewer" | null, rpc: Rpc = { data: archived, error: null }) {
  const client = {
    from: vi.fn((table: string) => {
      const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "company_members" && role ? { role } : null, error: null }) };
      return query;
    }),
    rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => rpc),
  };
  vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: user } } as unknown as Awaited<ReturnType<typeof verifiedSession>>);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ORIGIN = ORIGIN;
});

describe("the request body", () => {
  it("is exactly an expected revision and a request id", () => {
    expect(DeleteEntrySchema.safeParse(good).success).toBe(true);
    for (const bad of [{}, { requestId: request }, { expectedRevision: 3 }, { ...good, expectedRevision: 0 }, { ...good, expectedRevision: 1.5 }, { ...good, expectedRevision: "3" }, { ...good, requestId: "not-a-uuid" }, { ...good, kind: "key_person" }, { ...good, companyId: company }])
      expect(DeleteEntrySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("DELETE an entry", () => {
  it.each(["owner", "editor"] as const)("an %s archives it through the database with the revision and request they sent", async (role) => {
    const client = session(role);
    const response = await DELETE(del(good), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data).toEqual(archived);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("archive_entry", { p_company: company, p_entry: entry, p_expected_revision: 3, p_request: request });
  });

  it("answers a retry the way the database does (the route adds nothing of its own)", async () => {
    const client = session("owner");
    const first = await (await DELETE(del(good), params())).json();
    const again = await (await DELETE(del(good), params())).json();
    expect(again.data).toEqual(first.data);
    expect(client.rpc.mock.calls.map((c) => c[1])).toEqual([expect.objectContaining({ p_request: request }), expect.objectContaining({ p_request: request })]);
  });

  it("refuses a request from another origin or without one, before anything else", async () => {
    const client = session("owner");
    for (const origin of ["https://evil.example", null]) {
      const response = await DELETE(del(good, { origin }), params());
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("invalid_origin");
    }
    expect(verifiedSession).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    vi.mocked(verifiedSession).mockResolvedValue({ client: { rpc: vi.fn() }, user: null } as never);
    const response = await DELETE(del(good), params());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("signed_out");
  });

  it("a viewer is refused (403) and a non-member finds nothing (404), whatever the body says", async () => {
    const viewer = session("viewer");
    const forbidden = await DELETE(del(good), params());
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe("forbidden");
    expect(viewer.rpc).not.toHaveBeenCalled();
    const stranger = session(null);
    for (const body of [good, { nonsense: true }]) {
      const missing = await DELETE(del(body), params());
      expect(missing.status).toBe(404);
      expect((await missing.json()).error.code).toBe("unavailable");
    }
    expect(stranger.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["no JSON content type", () => del(good, { type: "text/plain" })],
    ["no content type", () => del(good, { type: null })],
    ["a body that is not JSON", () => del(null, { raw: "{nope" })],
    ["an empty body", () => del(null, { raw: "" })],
    ["a missing expected revision", () => del({ requestId: request })],
    ["a revision that is not a positive integer", () => del({ ...good, expectedRevision: -1 })],
    ["a request id that is not a uuid", () => del({ ...good, requestId: "1" })],
    ["a field the route does not know", () => del({ ...good, archived_at: "2026-01-01T00:00:00Z" })],
  ])("refuses %s with 400 and does not touch the database", async (_label, make) => {
    const client = session("owner");
    const response = await DELETE(make(), params());
    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([["companyId"], ["entryId"]])("refuses a %s that is not a uuid", async (name) => {
    const client = session("owner");
    const response = await DELETE(del(good), params({ [name]: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["stale_revision", { details: JSON.stringify({ currentRevision: 4, secret: "hidden" }) }, 409, "conflict", { currentRevision: 4 }],
    ["idempotency_conflict", {}, 409, "conflict", undefined],
    ["company_archived", {}, 422, "validation", undefined],
    ["invalid_entry_kind", {}, 422, "validation", undefined],
    ["unavailable", {}, 404, "unavailable", undefined],
    ["unavailable_archived_entry", {}, 404, "unavailable", undefined],
    ["forbidden", {}, 403, "forbidden", undefined],
    ["connection reset by peer password=secret", {}, 503, "unavailable", undefined],
  ])("maps the database refusal %s to %i without leaking its text", async (message, extra, status, code, details) => {
    session("owner", { data: null, error: { message, ...extra } });
    const response = await DELETE(del(good), params());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(body.error.details).toEqual(details);
    expect(JSON.stringify(body)).not.toMatch(/secret|password|hidden/);
  });

  it("does not pass on an answer that is not the archived entry", async () => {
    session("owner", { data: { id: entry, extra: "x" }, error: null });
    const response = await DELETE(del(good), params());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("invalid_response");
  });
});

describe("the draft read", () => {
  it("names the columns it reads from knowledge_entries, so the tombstone columns never reach the browser", async () => {
    const selects: Record<string, string[]> = {};
    const client = {
      from: vi.fn((table: string) => {
        const query: any = {
          select: (columns: string) => ((selects[table] ??= []).push(columns), query),
          eq: () => query,
          in: () => query,
          order: () => query,
          maybeSingle: async () =>
            table === "company_members"
              ? { data: { role: "owner" }, error: null }
              : table === "companies"
                ? { data: { id: company, name: "Acme", website_url: "https://acme.example", created_by: user, creation_request_id: request, created_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", archived_at: null, draft_generation: 1, next_snapshot_version: 1 }, error: null }
                : { data: null, error: null },
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return query;
      }),
    };
    vi.mocked(verifiedSession).mockResolvedValue({ client, user: { id: user } } as never);
    const response = await draft(new Request(`${ORIGIN}/api/companies/${company}/draft`), { params: Promise.resolve({ companyId: company }) });
    expect(response.status).toBe(200);
    const columns = selects.knowledge_entries!.join(",");
    expect(columns).not.toContain("*");
    expect(columns).not.toMatch(/archiv/);
    expect(columns.split(",")).toEqual(expect.arrayContaining(["id", "kind", "current_revision", "created_at"]));
  });
});
