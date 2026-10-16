import { expect, it, vi } from "vitest";
import { page, companyId, jobId, candidate } from "../worker/extraction-fixture";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import * as sourceExtractor from "../../src/worker/extract/deterministic";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import { reduceCandidates } from "../../src/worker/extract/reduce";
import { validateProvenance, entryBusiness } from "../../src/contracts";
import { normalizeColor } from "../../src/worker/extract/colors";
import { extractAndFinish } from "../../src/worker/extract/pipeline";
import type { Job, JobRepository } from "../../src/worker/job-repository";
const observations = technicalObservations(page);
it("validates all41 required assessments, stable IDs, exact evidence and explicit address conflicts", () => {
  const candidates = validateCandidates(
    deterministicCandidates(page, observations),
    page,
    observations,
    companyId,
  );
  const reduce = () =>
    reduceCandidates(candidates, {
      companyId,
      jobId,
      partial: false,
    });
  const proposals = reduce();
  expect(proposals).toHaveLength(7);
  expect(
    proposals.flatMap((p) => p.provenance.coverage.flatMap((c) => c.targets)),
  ).toHaveLength(41);
  const claims = proposals.flatMap((p) => p.provenance.claims);
  for (const p of proposals)
    expect(
      validateProvenance(entryBusiness(p.kind, p.content), p.provenance, {
        supportingClaims: claims,
      }),
    ).toEqual([]);
  const foundation = proposals.find((p) => p.kind === "company_foundation")!;
  expect(foundation.content).toMatchObject({
    legal_entity_type: null,
    main_address: null,
    employee_count: { exact: null, min: 25, max: 50 },
  });
  expect(foundation.conflicts[0].candidates).toHaveLength(2);
  expect(foundation.changes.map((change) => change.target)).toContain(
    "/company_foundation/overview",
  );
  expect(foundation.changes.map((change) => change.target)).not.toContain(
    "/company_foundation/main_address",
  );
  expect(foundation.changes.map((change) => change.target)).not.toContain(
    "/company_foundation/legal_entity_type",
  );
  expect(proposals.find((p) => p.kind === "key_person")?.content).toMatchObject(
    { name: "Jamie Park", gender: null },
  );
  expect(
    proposals.find((p) => p.kind === "positioning")?.provenance.claims[0],
  ).toMatchObject({
    origin: "source_backed",
    based_on_claim_ids: [],
  });
  const branding = proposals.find((p) => p.kind === "branding_and_style")!
    .content as {
    fonts: { observations: string[]; brand_confirmed: boolean }[];
    brand_colors: unknown[];
    logos: unknown[];
  };
  expect(
    branding.fonts.some((f) => f.observations.includes("computed_family")),
  ).toBe(true);
  expect(
    branding.fonts.some((f) => f.observations.includes("resource_loaded")),
  ).toBe(true);
  expect(branding.fonts.every((f) => !f.brand_confirmed)).toBe(true);
  expect(branding.brand_colors).toHaveLength(2);
  expect(branding.logos).toHaveLength(1);
  expect(reduce()).toEqual(proposals);
});
it("rejects forged segment IDs, inferred gender, invented exact employee counts and pricing", () => {
  const validate = (c: ReturnType<typeof candidate>) => () =>
    validateCandidates([c], page, observations, companyId);
  expect(
    validate({
      ...deterministicCandidates(page, observations).find(
        (c) => c.segment_ids.length > 0,
      )!,
      segment_ids: ["invented"],
    }),
  ).toThrow("invalid_segment");
  expect(
    validate(
      candidate("/key_people/@id/gender", "woman", "Jamie Park", "person", {
        note: "explicit public gender",
      }),
    ),
  ).toThrow("gender_not_explicit");
  expect(
    validate(
      candidate(
        "/company_foundation/employee_count",
        { raw: "25–50 people", exact: 25, min: null, max: null, as_of: null },
        "25–50 people",
      ),
    ),
  ).toThrow("employee_count_not_supported");
  const price = deterministicCandidates(page, observations).find(
    (c) => c.field.endsWith("/pricing"),
  )!;
  expect(
    validate({
      ...price,
      value: { ...(price.value as object), amount: "9999" },
    }),
  ).toThrow("price_not_supported");
  expect(normalizeColor("hsl(220, 50%, 50%)")).toEqual({
    hex: "#406ABF",
    alpha: 1,
  });
  expect(normalizeColor("rgba(1,2,3,0.5)")).toEqual({
    hex: "#010203",
    alpha: 0.5,
  });
});
it("checkpoints completed extraction without source bodies and resumes without repeating extraction", async () => {
  const repository = {
    checkpoint: vi.fn().mockResolvedValue({}),
    finish: vi.fn().mockResolvedValue({}),
  } as unknown as JobRepository;
  const job = { id: jobId, company_id: companyId } as Job;
  const crawl = {
    captures: [page],
    errors: [],
    checkpoint: {},
    progress: {
      stage: "crawling" as const,
      discovered: 1,
      selected: 1,
      captured: 1,
      failed: 0,
      blocked: 0,
      extracted: 0,
      document_limit: 10,
      limits_reached: [],
    },
  };
  const parser = vi.spyOn(sourceExtractor, "deterministicCandidates");
  const first = await extractAndFinish(
    job,
    repository,
    crawl,
    new AbortController().signal,
  );
  const checkpoint = vi.mocked(repository.checkpoint).mock.calls.at(-1)![1];
  expect(JSON.stringify(checkpoint)).not.toContain("cleaned_content");
  expect(checkpoint).not.toHaveProperty("text");
  expect((checkpoint.validated_candidates as object[])[0]).not.toHaveProperty(
    "page",
  );
  expect(parser).toHaveBeenCalledTimes(1);
  expect(checkpoint.extracted_source_ids).toEqual([page.id]);
  const retainedCandidates = structuredClone(checkpoint.validated_candidates);
  const second = await extractAndFinish(
    job,
    repository,
    { ...crawl, checkpoint },
    new AbortController().signal,
  );
  expect(parser).toHaveBeenCalledTimes(1);
  parser.mockRestore();
  const resumedCheckpoint = vi.mocked(repository.checkpoint).mock.calls.at(-1)![1];
  expect(resumedCheckpoint.extracted_source_ids).toEqual([page.id]);
  expect(resumedCheckpoint.validated_candidates).toEqual(retainedCandidates);
  expect(second).toEqual(first);
  expect(repository.finish).toHaveBeenCalledTimes(2);
});
it("deduplicates overlapping collection items without changing their stable identity", () => {
  const common = candidate(
    "/market_and_customers/target_buyers",
    [{ text: "community water teams" }],
    "community water teams",
  );
  const extended = candidate(
    "/market_and_customers/target_buyers",
    [{ text: "community water teams" }, { text: "water teams" }],
    "community water teams",
  );
  const values = validateCandidates(
    [common, extended],
    page,
    observations,
    companyId,
  );
  expect((values[0].value as { id: string }[])[0].id).toBe(
    (values[1].value as { id: string }[])[0].id,
  );
  const options = {
    companyId,
    jobId,
    partial: false,
  };
  const proposals = reduceCandidates(values, options);
  expect(
    (
      proposals.find((p) => p.kind === "market_and_customers")!.content as {
        target_buyers: unknown[];
      }
    ).target_buyers,
  ).toHaveLength(2);
  expect(reduceCandidates([...values].reverse(), options)).toEqual(proposals);
  expect(() =>
    validateCandidates(
      [{ ...common, value: [{ text: "Invented customers on Mars" }] }],
      page,
      observations,
      companyId,
    ),
  ).toThrow("value_not_in_evidence");
});
it("keeps explicit free, contact, range and unknown pricing distinct", () => {
  const variants = [
    {
      kind: "free",
      raw: "Free service",
      amount: null,
      min_amount: null,
      max_amount: null,
      currency: null,
      billing_interval: null,
      pricing_model: null,
      qualifications: [],
      as_of: null,
    },
    {
      kind: "contact_for_pricing",
      raw: "Contact for pricing",
      amount: null,
      min_amount: null,
      max_amount: null,
      currency: null,
      billing_interval: null,
      pricing_model: null,
      qualifications: [],
      as_of: null,
    },
    {
      kind: "paid",
      raw: "USD 20–40 per month",
      amount: null,
      min_amount: "20",
      max_amount: "40",
      currency: "USD",
      billing_interval: "month",
      pricing_model: null,
      qualifications: [],
      as_of: null,
    },
  ];
  const pricingPage = {
    ...page,
    capture: {
      ...page.capture,
      segments: [
        ...page.capture.segments,
        {
          id: "pricing-variants",
          text: "Free service. Contact for pricing. USD 20–40 per month.",
        },
      ],
    },
  };
  for (const value of variants) {
    const source = {
      field: "/offerings/@id/pricing",
      entity_key: "https://example.com/kit",
      value,
      origin: "source_backed" as const,
      segment_ids: ["pricing-variants"],
      observation_ids: [],
      supporting_fields: [],
      note: null,
    };
    const parsed = validateCandidates(
      [source],
      pricingPage,
      technicalObservations(pricingPage),
      companyId,
    );
    expect(parsed[0].value).toMatchObject(value);
  }
  expect(
    validateCandidates(
      [
        {
          ...deterministicCandidates(page, observations).find(
            (c) => c.field.endsWith("/pricing"),
          )!,
          value: null,
        },
      ],
      pricingPage,
      technicalObservations(pricingPage),
      companyId,
    ),
  ).toEqual([]);
});
