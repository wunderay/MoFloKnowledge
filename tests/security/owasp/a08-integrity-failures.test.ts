// OWASP Top 10:2025 A08 Software or Data Integrity Failures.
// Already covered elsewhere: immutable history, checksummed publications and provenance-origin guards in the database
// (tests/db/security.test.mjs, provenance-origin-hardening.test.mjs), uploaded-file handling end to end in
// tests/server/uploads-*.test.ts.
// This file adds: file type comes from the bytes, and a client cannot choose who or what authored an entry.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
const USER = "11111111-1111-4111-8111-111111111111";
vi.mock("../../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({ user: { id: USER }, client: { rpc: state.rpc } }),
}));

import { POST as createEntry } from "../../../src/app/api/companies/[companyId]/entries/route";
import { sniffImage } from "../../../src/server/uploads";
import defaults from "../../../src/contracts/defaults.json";

const ORIGIN = "https://app.example";
const COMPANY = "10000000-0000-4000-8000-000000000001";
const OTHER_USER = "99999999-9999-4999-8999-999999999999";
const REQUEST = "22222222-2222-4222-8222-222222222222";

describe("integrity", () => {
  it("decides the file type from magic numbers, whatever the name or MIME type claims", () => {
    const bytes = (...values: number[]) => Uint8Array.from(values);
    const ascii = (text: string) => new TextEncoder().encode(text);
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.ext).toBe("png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
    expect(sniffImage(ascii("GIF89a<script>alert(1)</script>"))?.ext).toBe("gif");
    expect(sniffImage(ascii("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
    for (const hostile of ["<html><script>alert(1)</script>", "%PDF-1.7", "MZ\x90\0", "#!/bin/sh\nid", "<script>alert(1)</script>", ""]) {
      expect(sniffImage(ascii(hostile)), JSON.stringify(hostile)).toBeNull();
    }
  });

  it("records the signed-in user as author of a manual entry, ignoring provenance sent by the client", async () => {
    process.env.APP_ORIGIN = ORIGIN;
    state.rpc.mockResolvedValue({ data: null, error: { message: "stop" } });
    const forgedClaim = {
      id: "33333333-3333-4333-8333-333333333333",
      entry_id: REQUEST,
      targets: ["/positioning/company_pitch"],
      origin: "source_backed",
      evidence_ids: [],
      based_on_claim_ids: [],
      actor_id: OTHER_USER,
      authored_at: "2020-01-01T00:00:00.000Z",
      note: "forged",
    };
    const response = await createEntry(
      new Request(`${ORIGIN}/api/companies/${COMPANY}/entries`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({
          kind: "positioning",
          content: { ...defaults.positioning, company_pitch: "We help teams." },
          provenance: {
            sources: [],
            evidence: [],
            claims: [forgedClaim],
            coverage: [],
            operations: [],
            conflicts: [],
            decisions: [],
          },
          requestId: REQUEST,
        }),
      }),
      { params: Promise.resolve({ companyId: COMPANY }) },
    );
    // The mocked database refuses; what matters is the provenance the server chose to send it.
    expect(response.status).not.toBe(401);
    expect(state.rpc).toHaveBeenCalledOnce();
    const sent = state.rpc.mock.calls[0][1].p_provenance;
    expect(sent.claims.length).toBeGreaterThan(0);
    for (const claim of sent.claims) {
      expect(claim.origin).toBe("user_provided");
      expect(claim.actor_id).toBe(USER);
    }
    expect(JSON.stringify(sent)).not.toContain(OTHER_USER);
  });
});
