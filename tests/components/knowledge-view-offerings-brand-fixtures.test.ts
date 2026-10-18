// Guard: the offerings and brand fixtures are data the product could hold, so the
// acceptance tests describe real inputs. The "hostile" fixtures are asserted to be
// schema-INVALID, so it is explicit that they test defence in depth.
import { describe, expect, it } from "vitest";
import { KnowledgeBaseExportSchema, validateProvenance, EntryProvenanceSchema } from "../../src/contracts";
import { DraftResponseSchema } from "../../src/contracts/api-responses";
import { LogoSchema, ColorSchema, FontSchema } from "../../src/contracts/value-types";
import { PricingSchema } from "../../src/contracts/numeric-values";
import { buildEmptyDraft } from "../helpers/knowledge-view-fixtures";
import {
  COLORS,
  FONTS,
  HOSTILE,
  LOGOS,
  OFFERINGS,
  brandDraft,
  brandSnapshot,
  emptyBrandDraft,
  evidenceFixture,
  manyColors,
  noOfferingsDraft,
  offeringsDraft,
  offeringsSnapshot,
} from "../helpers/knowledge-view-offerings-brand-fixtures";

describe("fixtures", () => {
  // guard
  it.each([
    ["offerings", offeringsDraft()],
    ["no offerings", noOfferingsDraft()],
    ["one offering", offeringsDraft([OFFERINGS[0]])],
    ["brand", brandDraft()],
    ["empty brand", emptyBrandDraft()],
    ["fourteen colours", brandDraft({ brand_colors: manyColors(14) })],
    ["no entries", buildEmptyDraft()],
    ["evidence", evidenceFixture().draft],
  ])("the %s draft is a valid DraftResponse", (_n, draft) => {
    expect(() => DraftResponseSchema.parse(draft)).not.toThrow();
  });

  // guard
  it("the snapshots are valid KnowledgeBaseExports carrying the same data", () => {
    for (const payload of [offeringsSnapshot().payload, brandSnapshot().payload, evidenceFixture().snapshot().payload]) {
      expect(() => KnowledgeBaseExportSchema.parse(payload)).not.toThrow();
    }
    expect(offeringsSnapshot().payload.offerings.map((o) => o.id)).toEqual(OFFERINGS.map((o) => o.id));
    expect(brandSnapshot().payload.branding_and_style.brand_colors).toHaveLength(COLORS.length);
  });

  // guard
  it("the evidence claims have no origin, support, target or evidence issues", () => {
    const fx = evidenceFixture();
    const all = fx.draft.entries.map((e) => e.provenance);
    const merged = {
      ...EntryProvenanceSchema.parse({ sources: [], evidence: [], claims: [], coverage: [], operations: [] }),
      sources: fx.sources,
      evidence: fx.evidence,
      claims: all.flatMap((p) => p.claims),
    };
    const issues = validateProvenance(fx.business as never, merged as never, {
      requireCoverage: false,
      entryIds: fx.draft.entries.map((e) => e.id),
      entryKinds: Object.fromEntries(fx.draft.entries.map((e) => [e.id, e.kind])),
    });
    expect(issues.filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
    expect(merged.claims).toHaveLength(9);
    const snap = fx.snapshot().payload;
    expect(validateProvenance(snap as never, snap.provenance, { requireCoverage: false }).filter((i) => i.code !== "leaf_unclaimed")).toEqual([]);
  });

  // guard
  it("the pricing, logo, colour and font values are schema-valid", () => {
    for (const o of OFFERINGS) {
      if (o.pricing) {
        expect(() => PricingSchema.parse(o.pricing)).not.toThrow();
      }
    }
    for (const l of LOGOS) {
      expect(() => LogoSchema.parse(l)).not.toThrow();
    }
    for (const c of [...COLORS, ...manyColors(14)]) {
      expect(() => ColorSchema.parse(c)).not.toThrow();
    }
    for (const f of FONTS) {
      expect(() => FontSchema.parse(f)).not.toThrow();
    }
    expect(new Set(manyColors(14).map((c) => c.hex)).size).toBe(14);
  });

  // guard
  it("Edge case: the hostile values really are schema-invalid (so those tests are defence in depth)", () => {
    expect(() => LogoSchema.parse({ ...LOGOS[0], url: HOSTILE.jsLogo })).toThrow();
    expect(() => LogoSchema.parse({ ...LOGOS[0], url: HOSTILE.dataLogo })).toThrow();
    for (const hex of [HOSTILE.badHex, HOSTILE.scriptHex, "blue", "#12345"]) {
      expect(() => ColorSchema.parse({ ...COLORS[0], hex })).toThrow();
    }
    expect(() => FontSchema.parse({ ...FONTS[0], family: null })).toThrow();
    expect(() => PricingSchema.parse({ ...OFFERINGS[0].pricing, raw: "" })).toThrow();
  });
});
