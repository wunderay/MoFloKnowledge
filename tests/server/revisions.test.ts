import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ verifiedSession: vi.fn() }));
import { prepareManualCreation } from "../../src/server/revisions";
import {
  createEntryDefault,
  validateProvenance,
  entryBusiness,
} from "../../src/contracts";
it("creates authentic manual claims and stable request identities with all field coverage", () => {
  const actor = "11111111-1111-4111-8111-111111111111",
    request = "22222222-2222-4222-8222-222222222222";
  const content = {
    ...createEntryDefault("company_foundation"),
    overview: "Company entered by reviewer",
  };
  const first = prepareManualCreation(
    "company_foundation",
    content,
    request,
    actor,
  );
  const second = prepareManualCreation(
    "company_foundation",
    content,
    request,
    actor,
  );
  expect(first.claims.map((c) => c.id)).toEqual(second.claims.map((c) => c.id));
  expect(first.claims[0]).toMatchObject({
    entry_id: request,
    origin: "user_provided",
    actor_id: actor,
    evidence_ids: [],
  });
  expect(first.coverage).toHaveLength(12);
  expect(
    validateProvenance(entryBusiness("company_foundation", content), first),
  ).toEqual([]);
});
import { preserveSelectedCandidates } from "../../src/server/revisions";
import { createEmptyProvenance } from "../../src/contracts";
it("preserves selected candidate origin/evidence and rejects changing its value", () => {
  const entry = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const p = createEmptyProvenance();
  p.conflicts = [
    {
      id,
      target: "/company_foundation/industry",
      material: true,
      candidates: [
        {
          id: entry,
          value: "Water monitoring",
          origin: "source_backed",
          evidence_ids: [entry],
          based_on_claim_ids: [],
        },
      ],
    },
  ];
  p.decisions = [
    {
      id: entry,
      conflict_id: id,
      target: "/company_foundation/industry",
      action: "select",
      candidate_id: entry,
      actor_id: id,
      decided_at: "2026-10-16T00:00:00Z",
      note: null,
    },
  ];
  p.evidence = [
    {
      id: entry,
      source_page_id: id,
      kind: "text",
      excerpt: "Water monitoring",
      technical: null,
    },
  ];
  p.sources = [
    {
      id,
      url: "https://example.com",
      title: null,
      author: null,
      site_name: null,
      published_on: null,
      retrieved_at: "2026-10-16T00:00:00Z",
    },
  ];
  const content = {
    ...createEntryDefault("company_foundation"),
    industry: "Water monitoring",
  };
  const saved = preserveSelectedCandidates(
    "company_foundation",
    content,
    structuredClone(p),
    { ...p, decisions: [] },
    entry,
    id,
  );
  expect(saved.claims[0]).toMatchObject({
    origin: "source_backed",
    evidence_ids: [entry],
    actor_id: null,
  });
  expect(saved.evidence).toHaveLength(1);
  expect(() =>
    preserveSelectedCandidates(
      "company_foundation",
      { ...content, industry: "Forged" },
      structuredClone(p),
      { ...p, decisions: [] },
      entry,
      id,
    ),
  ).toThrow("does not match");
});
it("preserves selected claim IDs on approval-only saves and permits later correction", () => {
  const entry = "11111111-1111-4111-8111-111111111111",
    conflict = "22222222-2222-4222-8222-222222222222";
  const p = createEmptyProvenance();
  p.claims = [
    {
      id: entry,
      entry_id: entry,
      targets: ["/company_foundation/industry"],
      origin: "source_backed",
      evidence_ids: [],
      based_on_claim_ids: [],
      actor_id: null,
      authored_at: null,
      note: null,
    },
  ];
  p.conflicts = [
    {
      id: conflict,
      target: "/company_foundation/industry",
      material: true,
      candidates: [
        {
          id: entry,
          value: "Water",
          origin: "source_backed",
          evidence_ids: [],
          based_on_claim_ids: [],
        },
      ],
    },
  ];
  p.decisions = [
    {
      id: entry,
      conflict_id: conflict,
      target: "/company_foundation/industry",
      action: "select",
      candidate_id: entry,
      actor_id: entry,
      decided_at: "2026-10-16T00:00:00Z",
      note: null,
    },
  ];
  const content = {
    ...createEntryDefault("company_foundation"),
    industry: "Water",
  };
  const unchanged = preserveSelectedCandidates(
    "company_foundation",
    content,
    structuredClone(p),
    p,
    entry,
    conflict,
  );
  expect(unchanged.claims).toEqual(p.claims);
  const corrected = preserveSelectedCandidates(
    "company_foundation",
    { ...content, industry: "Corrected" },
    structuredClone(p),
    p,
    entry,
    conflict,
  );
  expect(corrected.decisions[0].action).toBe("correct");
  expect(p.decisions[0].action).toBe("select");
});
