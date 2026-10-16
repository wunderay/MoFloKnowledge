import { expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema, createEmptyBusiness } from "../../src/contracts";
import { documentData, documentFilename, documentParagraphs, documentRuns, renderKnowledgeDocument } from "../../src/knowledge/document-export";

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
      const meanings: Record<string, string> = { css_declared: "declared CSS", resource_loaded: "loaded resources", computed_family: "computed font family",
        observed_website_color: "observed website color", brand_guide_confirmed: "brand-guide-confirmed color", company_logo: "company logo" };
      const expected = typeof value === "boolean" ? value ? "confirmed as brand guidance" : "not confirmed as brand guidance" : meanings[String(value)] ?? String(value);
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
  const native = load(xml, { xmlMode: true });
  const swatch = native("w\\:tc").filter((_index, node) => native(node).find("w\\:shd").attr("w:fill") === snapshot.branding_and_style.brand_colors[0].hex.slice(1));
  expect(swatch.find("w\\:tcW").attr("w:w")).toBe("480");
  expect(swatch.closest("w\\:tr").find("w\\:trHeight").attr("w:val")).toBe("480");
  expect(swatch.closest("w\\:tr").find("w\\:trHeight").attr("w:hRule")).toBe("exact");
  expect(xml).toContain("&lt;script&gt;");
  expect(xml).not.toContain("<script>");
  expect(Object.keys(zip.files).some((path) => /vba|embeddings|media\//.test(path))).toBe(false);
  const relationships = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const relationshipXml = load(relationships, { xmlMode: true });
  relationshipXml('Relationship[TargetMode="External"]').each((_index, item) => {
    expect(relationshipXml(item).attr("Target")).toMatch(/^https?:\/\//);
  });
  expect(snapshot).toEqual(before);
});

it("sanitizes document filenames for both draft and saved versions", () => {
  expect(documentFilename('../../Über Acme\r\n"', "draft")).toBe("uber-acme-knowledge-base-draft.docx");
  expect(documentFilename("公司", 12)).toBe("company-knowledge-base-v12.docx");
  expect(() => documentFilename("company", -1)).toThrow();
});

it("caps distinct narrative citations at three and basic facts at one without changing full provenance or bibliography", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  const uuid = (number: number) => `90000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  snapshot.provenance.sources = Array.from({ length: 5 }, (_, index) => ({
    ...snapshot.provenance.sources[0], id: uuid(index + 1), url: `https://source-${index + 1}.example/`,
  }));
  snapshot.provenance.evidence = Array.from({ length: 6 }, (_, index) => ({
    ...snapshot.provenance.evidence[0], id: uuid(index + 11),
    source_page_id: snapshot.provenance.sources[index % 5].id,
  }));
  const support = [3, 1, 5, 0, 2, 4, 1].map((index) => snapshot.provenance.evidence[index].id);
  snapshot.provenance.claims = snapshot.provenance.claims.map((claim) => ({ ...claim, evidence_ids: support }));
  const before = structuredClone(snapshot);
  const input = { kind: "snapshot" as const, snapshot };
  const paragraphs = documentParagraphs(input);
  expect(paragraphs.find((item) => item.text === snapshot.company_foundation.overview)?.citations).toEqual([1, 2, 3]);
  expect(paragraphs.find((item) => item.text.startsWith("Address:"))?.runs?.[0].citations).toEqual([1]);
  expect(paragraphs.flatMap(documentRuns).find((run) => run.citations?.length && run.text.includes(snapshot.company_foundation.website!))?.citations).toEqual([1]);
  expect(paragraphs.find((item) => item.text === snapshot.offerings[0].name)?.citations).toEqual([1]);
  for (const run of paragraphs.flatMap(documentRuns)) {
    expect(run.citations?.length ?? 0).toBeLessThanOrEqual(3);
    expect(new Set(run.citations).size).toBe(run.citations?.length ?? 0);
  }
  const zip = await JSZip.loadAsync(await renderKnowledgeDocument(input));
  const text = load(await zip.file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  expect(text).toContain(`${snapshot.company_foundation.overview} [1,2,3]`);
  expect(text).toContain(`Address: ${snapshot.company_foundation.main_address!.raw}. [1]`);
  expect(text).toContain(`${snapshot.offerings[0].name} [1]`);
  for (const source of snapshot.provenance.sources) {
    expect(paragraphs.some((item) => item.text === source.url)).toBe(true);
    expect(text).toContain(source.url);
  }
  expect(documentData(input)).toEqual(before);
});


it("writes connected prose and real small superscript source links without interpreting literal user brackets", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  const duplicate = "An exact repeated business statement.";
  snapshot.company_foundation.overview = `A verbatim company overview. ${duplicate}`;
  snapshot.company_foundation.business_model = `${duplicate}\nA unique qualification remains unchanged.`;
  snapshot.positioning.company_pitch = "Literal [1] text stays ordinary.\nAn intact short pitch.";
  const before = structuredClone(snapshot);
  const input = { kind: "snapshot" as const, snapshot };
  const paragraphs = documentParagraphs(input);
  const body = paragraphs.slice(0, paragraphs.findIndex((paragraph) => paragraph.text === "Coverage & unknowns"));
  const wording = body.map((paragraph) => paragraph.text).join("\n");
  expect(wording.split(duplicate)).toHaveLength(2);
  expect(wording).toContain("A unique qualification remains unchanged.");
  expect(wording).toContain("Retail software");
  expect(wording).toContain(`Address: ${snapshot.company_foundation.main_address!.raw}.`);
  expect(body.some((paragraph) => paragraph.label === "City" || paragraph.label === "Region")).toBe(false);
  expect(wording).toContain("Literal [1] text stays ordinary. An intact short pitch.");
  const zip = await JSZip.loadAsync(await renderKnowledgeDocument(input));
  const $ = load(await zip.file("word/document.xml")!.async("string"), { xmlMode: true });
  const bookmarks = new Set($("w\\:bookmarkStart").toArray().map((node) => $(node).attr("w:name")));
  const links = $("w\\:hyperlink").filter((_index, node) => Boolean($(node).attr("w:anchor")));
  expect(links.length).toBe(paragraphs.flatMap(documentRuns).reduce((count, run) => count + (run.citations?.length ?? 0), 0));
  expect(links.length).toBeGreaterThan(0);
  links.each((_index, node) => {
    const link = $(node);
    expect(bookmarks.has(link.attr("w:anchor"))).toBe(true);
    expect(link.attr("w:anchor")).toBe(`source_${link.text()}`);
    expect(link.find("w\\:sz").attr("w:val")).toBe("14");
    expect(link.find("w\\:vertAlign").attr("w:val")).toBe("superscript");
    expect(link.find("w\\:color").attr("w:val")).toBe("21699B");
  });
  const literal = $("w\\:t").filter((_index, node) => $(node).text().includes("Literal [1]"));
  expect(literal.length).toBe(1);
  expect(literal.closest("w\\:hyperlink").length).toBe(0);
  expect(snapshot).toEqual(before);
});


it("composes distinct populated and sparse company shapes without repetitive sentence scaffolding", () => {
  const rich = KnowledgeBaseExportSchema.parse(fixture);
  rich.company_foundation.overview = null;
  rich.company_foundation.legal_entity_type = "Cooperative";
  rich.company_foundation.year_founded = 2017;
  rich.key_people[0].title = "Engineering lead.";
  rich.key_people[0].role = "Founder";
  rich.offerings[0].category = "Inventory tools";
  rich.market_and_customers.target_buyers.push({ id: "90000000-0000-4000-8000-000000000001", text: "wholesale teams" });
  const before = structuredClone(rich);
  const richBody = documentParagraphs({ kind: "snapshot", snapshot: rich }).map((item) => item.text).join("\n").split("Coverage & unknowns")[0];
  expect(richBody).toContain("Retail software · Cooperative · Founded 2017");
  expect(richBody).toContain("Engineering lead; Founder");
  expect(richBody).toContain("Subscription · Inventory tools");
  expect(richBody).toContain("Customers: Independent retailers and wholesale teams");
  expect(richBody).toContain(rich.offerings[0].description);
  expect(richBody).not.toMatch(/(?:Its |It operates|Their role|offering type is|listed under)/);
  expect(rich).toEqual(before);
  rich.key_people[0].title = "Independent C.P.A.";
  expect(documentParagraphs({ kind: "snapshot", snapshot: rich }).map((item) => item.text)).toContain("Independent C.P.A.; Founder");
  const fontRuns = () => documentRuns(documentParagraphs({ kind: "snapshot", snapshot: rich })
    .find((item) => item.text.startsWith("Inter ·"))!);
  expect(fontRuns().filter((run) => run.citations?.length)).toHaveLength(1);
  const fontClaim = rich.provenance.claims.find((claim) => claim.targets.some((target) => target.endsWith("/brand_confirmed")))!;
  const brandTarget = fontClaim.targets.pop()!;
  expect(fontRuns().filter((run) => run.citations?.length)).toHaveLength(3); // An uncited qualification keeps separate support.
  rich.provenance.claims.push({ ...rich.provenance.claims[0], id: "90000000-0000-4000-8000-000000000003", targets: [brandTarget],
    evidence_ids: [rich.provenance.evidence[6].id] });
  expect(fontRuns().filter((run) => run.citations?.length)).toHaveLength(4); // Different sources retain their own markers.
  rich.market_and_customers.target_buyers = Array.from({ length: 11 }, (_, index) => ({
    id: `90000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, text: `Retail group ${index + 1}`,
  }));
  const compact = documentParagraphs({ kind: "snapshot", snapshot: rich }).find((item) => item.text.startsWith("Customers: "))!;
  expect(compact.bullet).toBeUndefined();
  expect(compact.text).toBe(`Customers: ${rich.market_and_customers.target_buyers.slice(0, -1).map((item) => item.text).join(", ")}, and Retail group 11`);

  const sparse = KnowledgeBaseExportSchema.parse(fixture);
  Object.assign(sparse, createEmptyBusiness());
  sparse.provenance.company.name = "Cedar Weave LLC";
  sparse.company_foundation.overview = "Cedar Weave LLC makes woven baskets for independent shops.";
  sparse.company_foundation.industry = "woven baskets";
  sparse.company_foundation.legal_entity_type = "LLC";
  sparse.company_foundation.website = sparse.provenance.company.website;
  const literal = "We help independent shops choose durable materials.";
  sparse.market_and_customers.target_buyers = [{ id: "90000000-0000-4000-8000-000000000002", text: literal }];
  const paragraphs = documentParagraphs({ kind: "snapshot", snapshot: sparse });
  const sparseBody = paragraphs.slice(0, paragraphs.findIndex((item) => item.text === "Coverage & unknowns"));
  expect(sparseBody.some((item) => item.text === "Company details")).toBe(false);
  expect(sparseBody.some((item) => item.text === literal && item.bullet)).toBe(true);
  expect(sparseBody.some((item) => item.text === "Key people" || item.text === "Offerings")).toBe(false);
  expect(paragraphs.map((item) => item.text).join("\n")).toContain("Unknown");
  sparse.provenance.company.name = "IT Basket Studio";
  sparse.company_foundation.overview = "It makes durable baskets. Visit https://it.example/ for details.";
  sparse.company_foundation.industry = "IT";
  const shortIndustry = documentParagraphs({ kind: "snapshot", snapshot: sparse }).map((item) => item.text);
  expect(shortIndustry).toContain("IT · LLC");
});
