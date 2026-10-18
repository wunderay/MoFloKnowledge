import { expect, it, vi } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFPage, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { canonicalStringify } from "../../src/knowledge/canonical-json";
import { documentParagraphs, documentRuns } from "../../src/knowledge/document-export";
import { renderKnowledgePdf } from "../../src/knowledge/pdf-export";

it("paginates a complete PDF with an embedded Unicode font and lossless original JSON attachment", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.branding_and_style.brand_colors[0].hex = "#FF8000";
  snapshot.company_foundation.overview = "Curly ‘quotes’, company’s costs — €12–€20. ".repeat(250) + "FINAL EXACT PASSAGE 😀";
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
  const drawing = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream)
    .map(([, stream]) => Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("utf8")).join("\n");
  expect(drawing).toContain("1 0.5019607843137255 0 rg");
  expect(drawing).toContain("0 0 m\n0 24 l\n24 24 l\n24 0 l\nh\nB");
  expect(canonicalStringify(snapshot)).toBe(before);
});

it("wraps real styled text and links each small citation to its actual end-reference page and position", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  const token = "long-unbroken-url-".repeat(100);
  snapshot.company_foundation.overview = "Literal [1] input stays body text. " + "An intact source paragraph. ".repeat(180) + token + " FINAL COMPLETE CONDITION.";
  const input = { kind: "snapshot" as const, snapshot };
  const drawText = vi.spyOn(PDFPage.prototype, "drawText");
  const rectangles = vi.spyOn(PDFPage.prototype, "drawRectangle");
  const pdf = await PDFDocument.load(await renderKnowledgePdf(input));
  expect(rectangles.mock.calls.some(([options]) => options?.width === 24 && options.height === 24)).toBe(true);
  const draws = drawText.mock.calls.map(([text, options], index) => ({ text, options: options!, page: drawText.mock.contexts[index] as PDFPage }));
  const bodyText = draws.filter((draw) => draw.options.size !== 7).map((draw) => draw.text).join("");
  expect(bodyText).toContain(token);
  expect(bodyText).toContain("FINAL COMPLETE CONDITION.");
  expect(draws.some((draw) => draw.text.includes("Literal [1]") && draw.options.size === 10.5)).toBe(true);
  const sourcePositions = new Map<number, { page: string; top: number }>();
  for (const draw of draws) {
    const number = draw.options.size === 11.5 ? (/^\[(\d+)\] /.exec(draw.text))?.[1] : undefined;
    if (number) {
      sourcePositions.set(Number(number), { page: draw.page.ref.toString(), top: draw.options.y! + draw.options.size! });
    }
    expect(draw.options.x! + draw.options.font!.widthOfTextAtSize(draw.text, draw.options.size!)).toBeLessThanOrEqual(612 - 43.2 + 0.01);
  }
  const internal: { page: number; annotation: PDFDict }[] = [];
  for (const [pageIndex, page] of pdf.getPages().entries()) {
    for (const reference of page.node.Annots()?.asArray() ?? []) {
    const annotation = pdf.context.lookup(reference, PDFDict);
    if (annotation.has(PDFName.of("Dest"))) {
      internal.push({ page: pageIndex, annotation });
    } else {
      expect(annotation.lookup(PDFName.of("A"), PDFDict).lookup(PDFName.of("S"))).toBe(PDFName.of("URI"));
    }
  }
  }
  const expected = documentParagraphs(input).flatMap(documentRuns).reduce((count, run) => count + (run.citations?.length ?? 0), 0);
  expect(internal.length).toBe(expected);
  expect(internal.length).toBeGreaterThan(0);
  expect(pdf.getPageCount()).toBeGreaterThan(3);
  for (const { page, annotation } of internal) {
    const rect = annotation.lookup(PDFName.of("Rect"), PDFArray).asArray().map((number) => (number as PDFNumber).asNumber());
    const draw = draws.find((draw) => draw.page.ref.toString() === pdf.getPage(page).ref.toString()
      && draw.options.size === 7 && Math.abs(draw.options.x! - rect[0]) < 0.001 && Math.abs(draw.options.y! - 1 - rect[1]) < 0.001);
    expect(draw).toBeDefined();
    const target = sourcePositions.get(Number(draw!.text));
    expect(target).toBeDefined();
    const destination = annotation.lookup(PDFName.of("Dest"), PDFArray);
    expect(destination.get(0).toString()).toBe(target!.page);
    expect(destination.get(1)).toBe(PDFName.of("XYZ"));
    expect(destination.lookup(3, PDFNumber).asNumber()).toBeCloseTo(target!.top, 4);
    expect(rect[0]).toBeGreaterThanOrEqual(0);
    expect(rect[1]).toBeGreaterThanOrEqual(0);
    expect(rect[2]).toBeLessThanOrEqual(612);
    expect(rect[3]).toBeLessThanOrEqual(792);
  }
});
