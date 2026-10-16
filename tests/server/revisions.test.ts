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
