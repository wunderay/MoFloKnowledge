import { expect, it } from "vitest";
import {
  CreateCompanySchema,
  MemberSchema,
  UpdateCompanySchema,
} from "../../src/contracts/api-companies";
import { EnqueueSchema } from "../../src/contracts/api-scrapes";
it("rejects authority injection, invalid URLs and excessive crawl ceilings", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  expect(
    CreateCompanySchema.safeParse({
      name: "Acme",
      website: "https://acme.example",
      requestId,
      createdBy: requestId,
    }).success,
  ).toBe(false);
  expect(
    CreateCompanySchema.safeParse({
      name: "Acme",
      website: "javascript:alert(1)",
      requestId,
    }).success,
  ).toBe(false);
  expect(
    EnqueueSchema.safeParse({
      url: "https://acme.example",
      requestId,
      options: { documentLimit: 26 },
    }).success,
  ).toBe(false);
  expect(MemberSchema.safeParse({ role: "owner", remove: true }).success).toBe(
    false,
  );
  expect(UpdateCompanySchema.safeParse({ expectedGeneration: 0 }).success).toBe(
    false,
  );
});

it("reads applied proposal selections while preserving old and dismissed decisions", async () => {
  const { JobResponseSchema } = await import(
    "../../src/contracts/api-responses"
  );
  const id = "11111111-1111-4111-8111-111111111111";
  const selected = "22222222-2222-4222-8222-222222222222";
  const at = "2026-10-16T00:00:00Z";
  const decision = {
    proposal_id: id,
    action: "apply",
    actor_id: id,
    at,
    revision_id: id,
    selected_candidate_ids: [selected],
  };
  const job = {
    id,
    company_id: id,
    status: "succeeded",
    progress: {
      stage: "succeeded",
      discovered: 1,
      selected: 1,
      captured: 1,
      failed: 0,
      blocked: 0,
      extracted: 1,
      document_limit: 10,
      limits_reached: [],
    },
    errors: [],
    proposals: {
      candidates: [],
      decisions: [decision],
      coverage: [],
      initialized_entry_ids: [],
    },
    cancel_requested_at: null,
    created_at: at,
    updated_at: at,
  };
  expect(
    JobResponseSchema.parse(job).proposals.decisions[0].selected_candidate_ids,
  ).toEqual([selected]);
  const { selected_candidate_ids: _selected, ...oldDecision } = decision;
  expect(
    JobResponseSchema.safeParse({
      ...job,
      proposals: {
        ...job.proposals,
        decisions: [
          oldDecision,
          {
            proposal_id: id,
            action: "dismiss",
            actor_id: id,
            at,
            reason: "Not selected.",
          },
        ],
      },
    }).success,
  ).toBe(true);
  expect(
    JobResponseSchema.safeParse({
      ...job,
      proposals: {
        ...job.proposals,
        decisions: [{ ...decision, selected_candidate_ids: ["malformed-id"] }],
      },
    }).success,
  ).toBe(false);
});
