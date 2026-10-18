// Acceptance: losing the race to create a singleton entry is a conflict (409), not an outage.
import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn(async () => ({ user: null, client: {} })) }));
import { mapDatabaseError } from "../../src/server/http";

describe("mapDatabaseError and the singleton index", () => {
  it("maps 23505 on knowledge_entries_singleton_idx to 409 conflict", () => {
    const error = mapDatabaseError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "knowledge_entries_singleton_idx"',
      details: "Key (company_id, kind)=(c, site_links) already exists.",
    });
    expect(error.status).toBe(409);
    expect(error.code).toBe("conflict");
    expect(error.message).not.toContain("knowledge_entries_singleton_idx");
  });
  it("still treats an unrelated unique violation as unavailable (503)", () => {
    expect(mapDatabaseError({ code: "23505", message: 'duplicate key value violates unique constraint "other_idx"' }).status).toBe(503);
  });
});
