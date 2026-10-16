import { expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { canonicalStringify } from "../../src/knowledge/canonical-json";
import { documentParagraphs } from "../../src/knowledge/document-export";
import { renderKnowledgePdf, wrapPdfText } from "../../src/knowledge/pdf-export";

it("paginates a complete PDF with an embedded Unicode font and lossless original JSON attachment", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.company_foundation.overview = "Curly ‘quotes’, company’s costs — €12–€20. ".repeat(150) + "FINAL EXACT PASSAGE 😀";
  snapshot.offerings[0].features = Array.from({ length: 35 }, (_, index) => ({
    id: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`, text: `Unabridged item ${index}`,
  }));
  const before = canonicalStringify(snapshot);
  const bytes = await renderKnowledgePdf({ kind: "snapshot", snapshot });
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(5);
  expect(pdf.getPages().every((page) => page.node.Contents() !== undefined)).toBe(true);
  expect(pdf.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict).keys().length).toBeGreaterThan(0);
  const files = pdf.catalog.lookup(PDFName.of("Names"), PDFDict)
    .lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
  expect(files.lookup(0, PDFHexString).decodeText()).toBe("knowledge.json");
  const stream = files.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"));
  expect(stream).toBeInstanceOf(PDFRawStream);
  expect(Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("utf8")).toBe(before);
  const projection = documentParagraphs({ kind: "snapshot", snapshot }).map((paragraph) => paragraph.text).join("\n");
  expect(projection).toContain(snapshot.company_foundation.overview);
  expect(projection).toContain("Unabridged item 34");
  expect(projection).toContain(snapshot.provenance.sources[0].url);
  expect(projection).not.toContain(snapshot.provenance.claims[0].targets[0]);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  expect(canonicalStringify(snapshot)).toBe(before);
});

it("wraps very long tokens and normal prose to measured page width without dropping characters", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const source = "Start " + "long-unbroken-url-".repeat(70) + " Final condition remains.";
  const lines = wrapPdfText(source, font, 10, 220);
  expect(lines.length).toBeGreaterThan(10);
  expect(lines.every((line) => font.widthOfTextAtSize(line, 10) <= 220)).toBe(true);
  expect(lines.join("").replaceAll(" ", "")).toBe(source.replaceAll(" ", ""));
});
