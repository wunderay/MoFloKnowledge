import { describe, it, expect } from "vitest";
import fixture from "./illustrative-export.json";
import {
  UUIDSchema,
  URLSchema,
  DateOnlySchema,
  EmployeeCountSchema,
  PricingSchema,
  FontSchema,
  SocialLinkSchema,
  KnowledgeBaseExportSchema,
  BusinessSchema,
  PersonSchema,
  OfferingSchema,
  FIELD_REGISTRY,
  createEmptyBusiness,
  createEntryDefault,
  requiredCoverageTargets,
  resolveStablePointer,
  enumerateFactualLeaves,
  validateProvenance,
  type Business,
  ProposalSchema,
  ModelOutputSchema,
  ProgressSchema,
  EntryProvenanceSchema,
} from "../../src/contracts";
const clone = () => structuredClone(fixture);
const business = (): Business => {
  const x = clone();
  return BusinessSchema.parse({
    company_foundation: x.company_foundation,
    positioning: x.positioning,
    market_and_customers: x.market_and_customers,
    branding_and_style: x.branding_and_style,
    online_presence: x.online_presence,
    key_people: x.key_people,
    offerings: x.offerings,
  });
};
describe("canonical business contracts", () => {
  it("validates real calendar dates, UUIDs and absolute HTTP URLs", () => {
    expect(DateOnlySchema.safeParse("2025-02-29").success).toBe(false);
    expect(DateOnlySchema.parse("2024-02-29")).toBe("2024-02-29");
    expect(UUIDSchema.safeParse("some-id").success).toBe(false);
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,hi",
      "https://u:p@example.com",
    ])
      expect(URLSchema.safeParse(url).success).toBe(false);
  });
  it("preserves all 41 exact field defaults and rejects missing or unknown nested keys", () => {
    const empty = createEmptyBusiness();
    expect(FIELD_REGISTRY).toHaveLength(41);
    expect(BusinessSchema.parse(empty)).toEqual(empty);
    expect(requiredCoverageTargets(empty)).toHaveLength(31);
    const missing = clone();
    delete (
      missing.company_foundation as Partial<typeof missing.company_foundation>
    ).overview;
    expect(KnowledgeBaseExportSchema.safeParse(missing).success).toBe(false);
    const extra = clone();
    Object.assign(extra.offerings[0].pricing!, { discount: 3 });
    expect(KnowledgeBaseExportSchema.safeParse(extra).success).toBe(false);
  });
  it("accepts the full plan illustrative export and all null/default business fields", () => {
    expect(KnowledgeBaseExportSchema.safeParse(fixture).success).toBe(true);
    expect(
      BusinessSchema.parse(createEmptyBusiness()).company_foundation
        .employee_count,
    ).toBe(null);
    expect(
      PersonSchema.safeParse(createEntryDefault("key_person")).success,
    ).toBe(false);
    expect(
      OfferingSchema.safeParse(createEntryDefault("offering")).success,
    ).toBe(false);
  });
  it("keeps exact employee counts distinct from ranges and approximations", () => {
    const range = {
      raw: "We employ 50–100 people",
      exact: null,
      min: 50,
      max: 100,
      as_of: null,
    };
    expect(EmployeeCountSchema.parse(range)).toEqual(range);
    expect(
      EmployeeCountSchema.safeParse({
        ...range,
        exact: 75,
        min: null,
        max: null,
      }).success,
    ).toBe(false);
    expect(
      EmployeeCountSchema.safeParse({ ...range, min: 100, max: 50 }).success,
    ).toBe(false);
  });
  it("keeps monetary decimals lossless and rejects contradictory free/contact prices", () => {
    const pricing = fixture.offerings[0].pricing;
    expect(PricingSchema.parse(pricing).amount).toBe("29.00");
    expect(
      PricingSchema.safeParse({ ...pricing, min_amount: "2.00" }).success,
    ).toBe(false);
    for (const kind of ["free", "contact_for_pricing"]) {
      expect(
        PricingSchema.safeParse({ ...pricing, kind, amount: "0" }).success,
      ).toBe(false);
      expect(
        PricingSchema.safeParse({ ...pricing, kind, amount: null }).success,
      ).toBe(true);
    }
    expect(
      PricingSchema.safeParse({
        ...pricing,
        amount: null,
        min_amount: "999999999999999999.12",
        max_amount: "999999999999999999.11",
      }).success,
    ).toBe(false);
  });
  it("keeps font observation metadata sorted and rejects share links", () => {
    const font = fixture.branding_and_style.fonts[0];
    expect(
      FontSchema.safeParse({
        ...font,
        observations: ["resource_loaded", "css_declared"],
      }).success,
    ).toBe(false);
    expect(
      SocialLinkSchema.safeParse({
        id: font.id,
        platform: "X",
        profile_url: "https://x.com/intent/tweet",
      }).success,
    ).toBe(false);
  });
});
describe("stable pointer and field-level provenance", () => {
  it("resolves escaped keys and ID pointers independently of array order", () => {
    const item = fixture.key_people[0];
    const value = { "a/b": { "~key": [item] } };
    expect(resolveStablePointer(value, `/a~1b/~0key/@${item.id}/name`)).toBe(
      item.name,
    );
    expect(() => resolveStablePointer(value, "/a~1b/~0key/0/name")).toThrow();
    expect(() =>
      resolveStablePointer({ items: [item, item] }, `/items/@${item.id}/name`),
    ).toThrow();
    expect(
      enumerateFactualLeaves({ key_people: [item] }).some((x) =>
        x.path.endsWith("/id"),
      ),
    ).toBe(false);
  });
  it("proves complete sample provenance including honest generated and user origins", () => {
    expect(validateProvenance(business(), fixture.provenance as never)).toEqual(
      [],
    );
  });
  it("rejects missing leaf claims, duplicated coverage and unsupported inference", () => {
    const p = clone().provenance;
    p.claims = p.claims.filter(
      (c) => !c.targets.includes("/company_foundation/website"),
    );
    p.coverage.push(p.coverage[0]);
    expect(
      validateProvenance(business(), p as never).map((x) => x.code),
    ).toEqual(expect.arrayContaining(["leaf_unclaimed", "coverage_count"]));
    const q = clone().provenance;
    q.claims.find((c) => c.origin === "inferred")!.evidence_ids = [];
    expect(
      validateProvenance(business(), q as never).some(
        (x) => x.code === "support_missing",
      ),
    ).toBe(true);
  });
  it("requires current support graph resolution, permitted origins and user attestation", () => {
    const p = clone().provenance;
    const generated = p.claims.find((c) => c.origin === "generated")!;
    generated.based_on_claim_ids = [generated.id];
    const user = p.claims.find((c) => c.origin === "user_provided")!;
    user.actor_id = null;
    expect(
      validateProvenance(business(), p as never).map((x) => x.code),
    ).toEqual(expect.arrayContaining(["claim_cycle", "user_attribution"]));
    const b = business();
    b.key_people[0].gender = "woman";
    const person = p.claims.find((c) =>
      c.targets.some((t) => t.endsWith("/name") && t.startsWith("/key_people")),
    )!;
    person.targets.push(`/key_people/@${b.key_people[0].id}/gender`);
    expect(
      validateProvenance(b, p as never).some(
        (x) => x.code === "gender_attestation",
      ),
    ).toBe(true);
  });
  it("verifies exact source text and technical observations against stored capture", () => {
    const p = clone().provenance;
    const captured = p.sources.map((s) => ({
      ...s,
      segments: p.evidence
        .filter((e) => e.source_page_id === s.id && e.excerpt)
        .map((e) => ({ text: e.excerpt! })),
      observations: p.evidence
        .filter((e) => e.source_page_id === s.id && e.technical)
        .map((e) => e.technical!),
    }));
    expect(
      validateProvenance(business(), p as never, { capturedSources: captured }),
    ).toEqual([]);
    captured[0].segments = [];
    expect(
      validateProvenance(business(), p as never, {
        capturedSources: captured,
      }).some((x) => x.code === "quote_mismatch"),
    ).toBe(true);
  });
  it("treats supersedes as historical but rejects unresolved current dependencies", () => {
    const p = clone().provenance;
    expect(
      validateProvenance(business(), p as never, {
        historicalClaimIds: [],
      }).some((x) => x.code === "historical_claim_missing"),
    ).toBe(true);
    p.claims.find((c) => c.origin === "generated")!.based_on_claim_ids = [
      p.operations[0].supersedes_claim_id!,
    ];
    expect(
      validateProvenance(business(), p as never).some(
        (x) => x.code === "claim_missing",
      ),
    ).toBe(true);
  });
});

describe("selected value boundaries", () => {
  it("rejects assigning one entry claim to another person or section", () => {
    const p = clone().provenance;
    const claim = p.claims.find((c) =>
      c.targets.some((t) => t.startsWith("/key_people/")),
    )!;
    claim.entry_id = p.entries[0].entry_id;
    expect(
      validateProvenance(business(), p as never).some(
        (i) => i.code === "entry_target",
      ),
    ).toBe(true);
  });
  it("requires candidate evidence, human resolution and selected-origin preservation", () => {
    const p = clone().provenance;
    const claim = p.claims.find((c) => c.origin === "generated")!;
    const id = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    const provenance = {
      sources: p.sources,
      evidence: p.evidence,
      claims: p.claims,
      coverage: p.coverage,
      operations: p.operations,
      conflicts: [
        {
          id,
          target: "/positioning/company_pitch",
          material: true,
          candidates: [
            {
              id: other,
              value: fixture.positioning.company_pitch,
              origin: "source_backed",
              evidence_ids: claim.evidence_ids,
              based_on_claim_ids: [],
            },
            {
              id: "00000000-0000-4000-8000-000000000003",
              value: "Another pitch",
              origin: "source_backed",
              evidence_ids: [],
              based_on_claim_ids: [],
            },
          ],
        },
      ],
      decisions: [],
    };
    const unresolved = validateProvenance(business(), provenance as never, {
      approved: true,
    });
    expect(unresolved.map((i) => i.code)).toEqual(
      expect.arrayContaining(["candidate_support", "unresolved_conflict"]),
    );
    Object.assign(provenance, {
      decisions: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          conflict_id: id,
          target: "/positioning/company_pitch",
          action: "select",
          candidate_id: other,
          actor_id: p.company.snapshot_author_id,
          decided_at: fixture.saved_at,
          note: "Selected exact statement",
        },
      ],
    });
    expect(
      validateProvenance(business(), provenance as never, {
        approved: true,
      }).some((i) => i.code === "conflict_claim"),
    ).toBe(true);
  });
});

describe("worker proposal trust boundary", () => {
  it("rejects wrong entry shapes, unsafe model metadata and negative progress", () => {
    const proposal = {
      id: fixture.provenance.entries[0].entry_id,
      kind: "company_foundation",
      target_entry_id: null,
      base_revision: null,
      schema_version: "1.0.0",
      content: fixture.positioning,
      provenance: EntryProvenanceSchema.parse({
        sources: [],
        evidence: [],
        claims: [],
        coverage: [],
        operations: [],
      }),
      conflicts: [],
    };
    expect(ProposalSchema.safeParse(proposal).success).toBe(false);
    expect(
      ModelOutputSchema.safeParse({
        candidates: [],
        limitations: [],
        actor_id: fixture.provenance.company.snapshot_author_id,
      }).success,
    ).toBe(false);
    expect(
      ProgressSchema.safeParse({
        stage: "crawling",
        discovered: 2,
        selected: 2,
        captured: -1,
        failed: 0,
        blocked: 0,
        extracted: 0,
        document_limit: 10,
        limits_reached: [],
      }).success,
    ).toBe(false);
  });
});
