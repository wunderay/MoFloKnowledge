// Guard: the Key People fixtures are data the product could hold (so the acceptance tests describe
// real inputs); the hostile one is asserted schema-INVALID (defence in depth).
import { describe, expect, it } from "vitest";
import { EntryProvenanceSchema, KnowledgeBaseExportSchema, PersonSchema, validateProvenance } from "../../src/contracts";
import { DraftResponseSchema } from "../../src/contracts/api-responses";
import { PortraitSchema } from "../../src/contracts/storage-ref";
import {
  PEOPLE,
  PORTRAIT,
  evidenceFixture,
  hostileDraft,
  noPeopleDraft,
  peopleDraft,
  peopleSnapshot,
  viewerDraft,
} from "../helpers/knowledge-view-people-fixtures";

describe("people fixtures", () => {
  // guard
  it.each([
    ["people", peopleDraft()],
    ["viewer", viewerDraft()],
    ["no people", noPeopleDraft()],
    ["evidence", evidenceFixture().draft],
  ])("the %s draft is a valid DraftResponse", (_n, draft) => {
    expect(() => DraftResponseSchema.parse(draft)).not.toThrow();
  });

  // guard
  it("every person and the portrait are schema-valid, and snapshots carry the same people", () => {
    for (const p of PEOPLE) expect(() => PersonSchema.parse(p)).not.toThrow();
    expect(() => PortraitSchema.parse(PORTRAIT)).not.toThrow();
    for (const payload of [peopleSnapshot().payload, evidenceFixture().snapshot().payload]) {
      expect(() => KnowledgeBaseExportSchema.parse(payload)).not.toThrow();
      expect(payload.key_people.map((p) => p.id)).toEqual(PEOPLE.map((p) => p.id));
    }
  });

  // guard
  it("the evidence claims have no origin, support, target or evidence issues", () => {
    const fx = evidenceFixture();
    const merged = {
      ...EntryProvenanceSchema.parse({ sources: [], evidence: [], claims: [], coverage: [], operations: [] }),
      sources: fx.draft.citationContext.sources,
      evidence: fx.draft.citationContext.evidence,
      claims: fx.draft.entries.flatMap((e) => e.provenance.claims),
    };
    const issues = validateProvenance(fx.business as never, merged as never, {
      requireCoverage: false,
      entryIds: fx.draft.entries.map((e) => e.id),
      entryKinds: Object.fromEntries(fx.draft.entries.map((e) => [e.id, e.kind])),
    });
    expect(issues.filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
    expect(merged.claims).toHaveLength(3);
    const snap = fx.snapshot().payload;
    expect(validateProvenance(snap as never, snap.provenance, { requireCoverage: false }).filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
  });

  // guard
  it("Edge case: the hostile person really is schema-invalid", () => {
    const hostile = hostileDraft().entries.find((e) => e.kind === "key_person")!;
    expect(() => PersonSchema.parse(hostile.content)).toThrow();
  });
});
