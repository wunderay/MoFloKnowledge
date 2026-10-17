// The export is defence in depth: even an object that skipped validation must not yield a non-http(s) hyperlink.
import { expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import { PDFArray, PDFDocument, PDFName } from "pdf-lib";
import fixture from "../contracts/site-links-export.json";
import { documentParagraphs, documentRuns, renderKnowledgeDocument } from "../../src/knowledge/document-export";
import { renderKnowledgePdf } from "../../src/knowledge/pdf-export";

const unsafe = "javascript:alert(1)";
const snapshot = () => {
  const copy = structuredClone(fixture);
  copy.site_links.links[0].url = unsafe;
  return copy as never;
};

it("document paragraphs give a javascript: site link URL as text but never as an href", () => {
  const runs = documentParagraphs({ kind: "snapshot", snapshot: snapshot() }).flatMap(documentRuns);
  expect(runs.some((run) => run.text.includes(unsafe))).toBe(true);
  expect(runs.filter((run) => run.href !== undefined).every((run) => /^https?:\/\//i.test(run.href!))).toBe(true);
  expect(runs.some((run) => run.href?.includes("javascript:"))).toBe(false);
  // Control: a valid link next to it still becomes a hyperlink.
  expect(runs.some((run) => run.href === fixture.site_links.links[1].url)).toBe(true);
});

it("the OOXML document has no external relationship that is not http(s)", async () => {
  const zip = await JSZip.loadAsync(await renderKnowledgeDocument({ kind: "snapshot", snapshot: snapshot() }));
  const relationships = load(await zip.file("word/_rels/document.xml.rels")!.async("string"), { xmlMode: true });
  const targets = relationships('Relationship[TargetMode="External"]').map((_index, item) => relationships(item).attr("Target")).get();
  expect(targets.some((target) => target.startsWith("https://lumen-ledger.example/pricing"))).toBe(true);
  expect(targets.every((target) => /^https?:\/\//i.test(target))).toBe(true);
});

it("the PDF has no link annotation for it", async () => {
  const pdf = await PDFDocument.load(await renderKnowledgePdf({ kind: "snapshot", snapshot: snapshot() }));
  const uris = pdf.getPages().flatMap((page) => {
    const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    return annotations ? annotations.asArray().map((item) => String(pdf.context.lookup(item))) : [];
  });
  expect(uris.length).toBeGreaterThan(0);
  expect(uris.some((entry) => entry.includes("javascript"))).toBe(false);
});
