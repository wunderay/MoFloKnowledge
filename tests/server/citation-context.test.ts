import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { readCitationContext } from "../../src/server/citation-context";
import { createEmptyProvenance } from "../../src/contracts";
import type { verifiedSession } from "../../src/lib/supabase/server";
it("resolves only referenced company-scoped historical support without changing entry claims", async () => {
  const root = createEmptyProvenance();
  const old = createEmptyProvenance();
  const rootId = "11111111-1111-4111-8111-111111111111";
  const factId = "22222222-2222-4222-8222-222222222222";
  const sourceId = "33333333-3333-4333-8333-333333333333";
  const evidenceId = "44444444-4444-4444-8444-444444444444";
  root.claims = [
    {
      id: rootId,
      entry_id: rootId,
      targets: ["/positioning/company_pitch"],
      origin: "generated",
      evidence_ids: [],
      based_on_claim_ids: [factId],
      actor_id: null,
      authored_at: null,
      note: null,
    },
  ];
  old.claims = [
    {
      ...root.claims[0],
      id: factId,
      origin: "source_backed",
      targets: ["/company_foundation/overview"],
      based_on_claim_ids: [],
      evidence_ids: [evidenceId],
    },
  ];
  old.sources = [
    {
      id: sourceId,
      url: "https://example.com/",
      title: "Original source",
      author: null,
      site_name: null,
      published_on: null,
      retrieved_at: "2026-10-16T00:00:00Z",
    },
  ];
  old.evidence = [
    {
      id: evidenceId,
      source_page_id: sourceId,
      kind: "text",
      excerpt: "The exact original supporting fact.",
      technical: null,
    },
  ];
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { provenance: old }, error: null }),
  };
  const client = { from: vi.fn().mockReturnValue(query) } as unknown as Awaited<
    ReturnType<typeof verifiedSession>
  >["client"];
  const context = await readCitationContext(client, rootId, [root]);
  expect(query.eq).toHaveBeenCalledWith("company_id", rootId);
  expect(query.contains).toHaveBeenCalledWith("provenance", {
    claims: [{ id: factId }],
  });
  expect(context.claims.map((claim) => claim.id)).toEqual([rootId, factId]);
  expect(context.evidence).toEqual(old.evidence);
  expect(context.sources).toEqual(old.sources);
  expect(root.claims).toHaveLength(1);
});
