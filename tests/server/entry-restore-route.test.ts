// Quest Q8, the server side of "Undo" after deleting an offering: POST /api/companies/<company>/entries/<entry>/restore.
// The database does the work (public.restore_entry, migration 0023, proven in tests/db/entry-restore.test.mjs); this file
// proves the route in front of it: origin, session, role, body and error mapping.
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { verifiedSession } from "../../src/lib/supabase/server";
import { POST } from "../../src/app/api/companies/[companyId]/entries/[entryId]/restore/route";

const ORIGIN = "https://app.example";
const company = "10000000-0000-4000-8000-0000000000b1";
const entry = "30000000-0000-4000-8000-0000000000b2";
const user = "40000000-0000-4000-8000-0000000000b3";
const restored = { id: entry, kind: "offering", revision: 3 };
const params = (over: Record<string, string> = {}) => ({ params: Promise.resolve({ companyId: company, entryId: entry, ...over }) });
const post = (body: unknown = {}, init: { origin?: string | null } = {}) =>
  new Request(`${ORIGIN}/api/companies/${company}/entries/${entry}/restore`, {
    method: "POST",
    headers: { ...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }), "content-type": "application/json" },
    body: JSON.stringify(body),
  });

type Rpc = { data: unknown; error: { message: string; details?: string; code?: string } | null };
function session(role: "owner" | "editor" | "viewer" | null, rpc: Rpc = { data: restored, error: null }) {
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

describe("POST restore an entry", () => {
  it.each(["owner", "editor"] as const)("an %s restores it through the database", async (role) => {
    const client = session(role);
    const response = await POST(post(), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data).toEqual(restored);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("restore_entry", { p_company: company, p_entry: entry });
  });

  it("refuses another origin, a viewer (403) and a non-member (404) without touching the database", async () => {
    const owner = session("owner");
    expect((await POST(post({}, { origin: "https://evil.example" }), params())).status).toBe(403);
    expect(owner.rpc).not.toHaveBeenCalled();
    const viewer = session("viewer");
    expect((await POST(post(), params())).status).toBe(403);
    expect(viewer.rpc).not.toHaveBeenCalled();
    const stranger = session(null);
    expect((await POST(post(), params())).status).toBe(404);
    expect(stranger.rpc).not.toHaveBeenCalled();
  });

  it("takes no body fields, and refuses an id that is not a uuid", async () => {
    const client = session("owner");
    expect((await POST(post({ revision: 1 }), params())).status).toBe(400);
    expect((await POST(post(), params({ entryId: "nope" }))).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps the database's refusals: not archived is a validation error (422), a missing entry is 404", async () => {
    session("owner", { data: null, error: { message: "not_archived" } });
    const refused = await POST(post(), params());
    expect(refused.status).toBe(422);
    session("owner", { data: null, error: { message: "unavailable" } });
    expect((await POST(post(), params())).status).toBe(404);
  });
});
