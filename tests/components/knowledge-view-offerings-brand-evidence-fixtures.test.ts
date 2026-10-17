// Guard: the item-level evidence fixtures are data the product could hold.
import { describe, expect, it } from "vitest";
import { EntryProvenanceSchema, KnowledgeBaseExportSchema, validateProvenance } from "../../src/contracts";
import { DraftResponseSchema } from "../../src/contracts/api-responses";
import { buildObEvidence } from "../helpers/knowledge-view-offerings-brand-evidence";

describe("item evidence fixtures", () => {
  const variants = [
    ["full", {}],
    ["no colors and no fonts", { business: (b: never) => Object.assign((b as { branding_and_style: object }).branding_and_style, { brand_colors: [], fonts: [] }) }],
  ] as const;

  // guard
  it.each(variants)("the %s draft and snapshot are valid", (_name, opts) => {
    const fx = buildObEvidence(opts as never);
    expect(() => DraftResponseSchema.parse(fx.draft)).not.toThrow();
    expect(() => KnowledgeBaseExportSchema.parse(fx.snapshot().payload)).not.toThrow();
  });

  // guard
  it.each(variants)("the %s claims have no origin, support, target or evidence issues", (_name, opts) => {
    const fx = buildObEvidence(opts as never);
    const merged = {
      ...EntryProvenanceSchema.parse({ sources: [], evidence: [], claims: [], coverage: [], operations: [] }),
      sources: fx.sources,
      evidence: fx.evidence,
      claims: fx.draft.entries.flatMap((e) => e.provenance.claims),
    };
    const issues = validateProvenance(fx.business as never, merged as never, {
      requireCoverage: false,
      entryIds: fx.draft.entries.map((e) => e.id),
      entryKinds: Object.fromEntries(fx.draft.entries.map((e) => [e.id, e.kind])),
    });
    expect(issues.filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
    const snap = fx.snapshot().payload;
    expect(validateProvenance(snap as never, snap.provenance, { requireCoverage: false }).filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
    expect(merged.claims.length).toBeGreaterThanOrEqual(6);
  });

  // guard
  it("the claims cover all three origins and a source-backed and a user-corrected item per brand list", () => {
    const fx = buildObEvidence();
    expect(new Set(fx.claims.map((c) => c.origin))).toEqual(new Set(["source_backed", "inferred", "user_provided"]));
    expect(fx.claims).toHaveLength(10);
    expect(fx.coverage.map((c) => c.status).sort()).toEqual(["not_checked", "not_checked", "not_found", "not_found", "partial", "partial", "partial"]);
  });
});
