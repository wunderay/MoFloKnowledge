// The export keeps at most 1,000 + 1 coverage rows: 1,000 was the maximum before site_links, which adds one registered field.
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

it("accepts a snapshot at the new maximum of 1,001 coverage rows and still rejects one more", () => {
  expect(fixture.provenance.coverage.length).toBeLessThan(1000);
  expect(KnowledgeBaseExportSchema.safeParse(withRows(1000)).success).toBe(true);
  expect(KnowledgeBaseExportSchema.safeParse(withRows(1001)).success).toBe(true);
  expect(KnowledgeBaseExportSchema.safeParse(withRows(1002)).success).toBe(false);
});
