import { expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { documentFilename, renderKnowledgeDocument } from "../../src/knowledge/document-export";

it("creates a real OOXML document formatting a complete profile with full nested values, lists, human coverage notes and source references", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  const long = "Exact complete passage. ".repeat(500) + "UNIQUE END OF FULL PASSAGE";
  snapshot.offerings[0].description = long;
  snapshot.offerings[0].features = Array.from({ length: 30 }, (_, index) => ({
    id: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`, text: `Full feature ${index}`,
  }));
  snapshot.market_and_customers.funnels = [{ id: "80000000-0000-4000-8000-000000000100", name: "Nested funnel",
    steps: [{ id: "80000000-0000-4000-8000-000000000101", label: "Deep nested step", url: "https://example.com/step" }] }];
  snapshot.company_foundation.overview = '<script>alert("source")</script> & exact stored wording';
  snapshot.provenance.coverage[0].status = "not_checked";
  snapshot.provenance.coverage[0].reason = "Unassessed field requires manual review.";
  const before = structuredClone(snapshot);
  const bytes = await renderKnowledgeDocument({ kind: "snapshot", snapshot });
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const zip = await JSZip.loadAsync(bytes);
  expect(zip.file("[Content_Types].xml")).not.toBeNull();
  expect(zip.file("_rels/.rels")).not.toBeNull();
  const xml = await zip.file("word/document.xml")!.async("string");
  const text = load(xml, { xmlMode: true }).text();
  expect(text).toContain(long);
  for (let index = 0; index < 30; index++) expect(text).toContain(`Full feature ${index}`);
  for (const value of ["Overview", "Company details", "Pitch", "Market & customers", "Founding story", "Branding & style", "Online presence", "Key people", "Offerings", "Deep nested step", "29.00", "Unknown", "Not checked", "Unassessed field requires manual review.", snapshot.provenance.sources[0].url, snapshot.company_foundation.overview]) {
    expect(text).toContain(value);
  }
  const businessBody = text.split("Coverage & unknowns")[0];
  expect(businessBody).not.toContain(snapshot.offerings[0].id);
  expect(businessBody).not.toContain("Values:");
  expect(businessBody).not.toContain("Item 1:");
  expect(text).not.toContain(snapshot.provenance.claims[0].targets[0]);
  const compactText = text.replace(/\s+/g, "");
  const checkValues = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(checkValues);
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => {
      if (key !== "id") checkValues(child);
    });
    else if (value !== null && value !== "") {
      const expected = typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
      expect(compactText).toContain(expected.replace(/\s+/g, ""));
    }
  };
  for (const key of ["company_foundation", "positioning", "market_and_customers", "branding_and_style", "online_presence", "key_people", "offerings"] as const) checkValues(snapshot[key]);
  expect(xml).toContain('w:val="Heading1"');
  expect(xml).toContain("<w:b/>");
  expect(xml).toContain("<w:numPr>");
  expect(xml).toContain('w:w="12240"');
  expect(xml).toContain('w:h="15840"');
  expect(xml).toContain('w:bottom');
  expect(xml).toContain(`w:fill="${snapshot.branding_and_style.brand_colors[0].hex.slice(1)}"`);
  expect(xml).toContain("&lt;script&gt;");
  expect(xml).not.toContain("<script>");
  expect(Object.keys(zip.files).some((path) => /vba|embeddings|media\//.test(path))).toBe(false);
  const relationships = await zip.file("word/_rels/document.xml.rels")!.async("string");
  expect(relationships).not.toContain('TargetMode="External"');
  expect(snapshot).toEqual(before);
});

it("sanitizes document filenames for both draft and saved versions", () => {
  expect(documentFilename('../../Über Acme\r\n"', "draft")).toBe("uber-acme-knowledge-base-draft.docx");
  expect(documentFilename("公司", 12)).toBe("company-knowledge-base-v12.docx");
  expect(() => documentFilename("company", -1)).toThrow();
});
