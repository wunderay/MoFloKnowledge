// Guard: the provenance fixtures are claims the product could hold (registry-allowed
// origins, supported generated wording, resolvable targets and evidence), so the
// evidence tests describe real inputs.
import { describe, expect, it } from "vitest";
import {
  EntryProvenanceSchema,
  validateProvenance,
  type EntryProvenance,
} from "../../src/contracts";
import {
  ITEM_MARKS,
  buildEvidence,
  markOf,
  refillLists,
} from "../helpers/knowledge-view-evidence";

const everyMark = ITEM_MARKS.flatMap((m) => [markOf(m, 0)]);
const fixture = buildEvidence({ marks: everyMark, coverage: [], business: refillLists });

/** The draft's per-entry provenance merged into one, as the whole company's evidence. */
function merged(): EntryProvenance {
  const out = EntryProvenanceSchema.parse({ sources: [], evidence: [], claims: [], coverage: [], operations: [] });
  const byId = <T extends { id: string }>(list: T[]) => [...new Map(list.map((x) => [x.id, x])).values()];
  const all = fixture.draft.entries.map((e) => e.provenance);
  return {
    ...out,
    sources: byId(all.flatMap((p) => p.sources)),
    evidence: byId(all.flatMap((p) => p.evidence)),
    claims: byId(all.flatMap((p) => p.claims)),
  };
}

describe("fixtures", () => {
  // guard
  it("the draft's provenance has no origin, support, target or evidence issues", () => {
    const issues = validateProvenance(fixture.business as never, merged(), {
      requireCoverage: false,
      entryIds: fixture.draft.entries.map((e) => e.id),
      entryKinds: Object.fromEntries(fixture.draft.entries.map((e) => [e.id, e.kind])),
    });
    // Most leaves carry no claim by design; every claim that exists must be valid.
    expect(issues.filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
    expect(fixture.claims.length).toBe(2 + everyMark.length);
  });

  // guard
  it("the snapshot's provenance validates the same way", () => {
    const { payload } = fixture.snapshot;
    const issues = validateProvenance(payload as never, payload.provenance, { requireCoverage: false });
    expect(issues.filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
  });

  // guard
  it("Edge case: generated wording on a field that forbids it is reported, so the check is not vacuous", () => {
    const bad = buildEvidence({
      coverage: [],
      marks: [{ target: (b) => `/market_and_customers/target_buyers/@${b.market_and_customers.target_buyers[0].id}/text`, origin: "generated" }],
    });
    const all = bad.draft.entries.map((e) => e.provenance);
    const p = { ...all[0], claims: all.flatMap((x) => x.claims), evidence: all.flatMap((x) => x.evidence), sources: all[2].sources };
    const issues = validateProvenance(bad.business as never, p as never, { requireCoverage: false });
    expect(issues.map((i) => i.code)).toContain("origin_disallowed");
  });
});
