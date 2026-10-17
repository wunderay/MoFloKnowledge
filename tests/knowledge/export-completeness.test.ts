import { expect, it } from "vitest";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { documentParagraphs } from "../../src/knowledge/document-export";

it("keeps an outlook item's publisher and publication date when its text repeats the overview", () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  const overview = snapshot.company_foundation.overview!;
  snapshot.market_and_customers.industry_outlook = [
    { id: "90000000-0000-4000-8000-000000000001", text: overview, publisher: "Acme Research", published_on: "2024-05-01" },
  ];
  const body = documentParagraphs({ kind: "snapshot", snapshot }).map((item) => item.text).join("\n").split("Coverage & unknowns")[0];
  expect(body).toContain("Acme Research");
  expect(body).toContain("2024-05-01");
  expect(body.split(overview)).toHaveLength(2);
});

it("renders an address that has only a label instead of dropping it", () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.company_foundation.main_address = {
    id: "90000000-0000-4000-8000-000000000002", label: "HQ", raw: null, line1: null, line2: null,
    city: null, region: null, postal_code: null, country: null,
  };
  const texts = documentParagraphs({ kind: "snapshot", snapshot }).map((item) => item.text);
  expect(texts).toContain("Address: HQ.");
});
