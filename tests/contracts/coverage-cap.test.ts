// The export keeps at most 4,033 coverage rows (32 singleton rows + 8 per person or offering x 500 + 1). It was 1,001 (1,000
// before site_links); the model fields raised it, see model-fields-coverage-cap.test.ts for the derivation.
import { expect, it } from "vitest";
import fixture from "./site-links-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";

const withRows = (count: number) => {
  const copy = structuredClone(fixture);
  const rows = copy.provenance.coverage;
  for (let index = rows.length; index < count; index++)
    rows.push({ targets: [`/key_people/@a6000000-0000-4000-8000-${String(index).padStart(12, "0")}/name`], status: "not_checked", job_id: null, reason: "Entered manually." } as never);
  return copy;
};

it("accepts a snapshot at the new maximum of 4,033 coverage rows and still rejects one more", () => {
  expect(fixture.provenance.coverage.length).toBeLessThan(4033);
  expect(KnowledgeBaseExportSchema.safeParse(withRows(1001)).success).toBe(true);
  expect(KnowledgeBaseExportSchema.safeParse(withRows(4033)).success).toBe(true);
  expect(KnowledgeBaseExportSchema.safeParse(withRows(4034)).success).toBe(false);
});
