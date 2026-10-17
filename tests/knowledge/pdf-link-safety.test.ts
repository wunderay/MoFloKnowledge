// A stored URL is user text. It must never be able to close the PDF string and add actions to a link annotation.
import { expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import fixture from "../contracts/site-links-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { renderKnowledgePdf } from "../../src/knowledge/pdf-export";

const hostile = "https://acme.example/x)/S/JavaScript/JS(app.alert(1)";

async function linkActions(snapshot: unknown) {
  const pdf = await PDFDocument.load(await renderKnowledgePdf({ kind: "snapshot", snapshot: snapshot as never }));
  const actions: PDFDict[] = [];
  for (const page of pdf.getPages()) {
    const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    for (let index = 0; annotations && index < annotations.size(); index++) {
      const action = annotations.lookup(index, PDFDict).lookupMaybe(PDFName.of("A"), PDFDict);
      if (action) actions.push(action);
    }
  }
  return actions;
}
const uri = (action: PDFDict) => (action.lookup(PDFName.of("URI"), PDFString) as PDFString).asString();

it("a site link URL with PDF string delimiters stays one URI action with no JavaScript", async () => {
  const snapshot = structuredClone(fixture);
  snapshot.site_links.links[0].url = hostile;
  expect(KnowledgeBaseExportSchema.safeParse(snapshot).success).toBe(true);
  const actions = await linkActions(snapshot);
  const encoded = "https://acme.example/x%29/S/JavaScript/JS%28app.alert%281%29";
  expect(actions.map(uri)).toContain(encoded);
  for (const action of actions) {
    expect(action.lookup(PDFName.of("S"))).toBe(PDFName.of("URI"));
    expect(action.keys().map((key) => key.toString()).sort()).toEqual(["/S", "/URI"]);
    expect(uri(action)).not.toMatch(/[()\\]/);
  }
});

it("a crawled source URL is protected the same way", async () => {
  const snapshot = structuredClone(fixture);
  snapshot.provenance.sources[0].url = "https://acme.example/s\\)/S/JavaScript/JS(app.alert(2)";
  const actions = await linkActions(snapshot);
  expect(actions.length).toBeGreaterThan(0);
  for (const action of actions) {
    expect(action.keys().map((key) => key.toString()).sort()).toEqual(["/S", "/URI"]);
    expect(uri(action)).not.toMatch(/[()\\]/);
  }
});
