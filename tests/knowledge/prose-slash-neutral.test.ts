import { expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { documentParagraphs, renderKnowledgeDocument } from "../../src/knowledge/document-export";
import { factualBullets } from "../../src/knowledge/narrative-prose";

const texts = (tail: string) => factualBullets(`We provide ${tail}`, "Lumen Ledger").map((bullet) => bullet.text);

it("neutralises slash-joined and dot-joined prose while keeping literal tokens", () => {
  expect(texts("tools for our/their clients.")).toEqual(["tools for its/their clients."]);
  expect(texts("tools for our/our clients.")).toEqual(["tools for its/its clients."]);
  expect(texts("tools for our/their/our clients.")).toEqual(["tools for its/their/its clients."]);
  expect(texts("tools for our clients at example.com/our-team.")).toEqual(["tools for its clients at example.com/our-team."]);
  expect(texts("tools for our clients at our.com today.")).toEqual(["tools for its clients at our.com today."]);
  expect(texts("tools for our clients at our.com.")).toEqual(["tools for its clients at our.com."]);
  for (const token of ["our.studio", "our.cloud", "our.xn--p1ai", "our.co.za", "our.com#top", "our.com#", "our.clients", "#our-team", "@our-brand",
    "@our.brand", "#our-team2", "#our-team's", "our@localhost", "our@example.com/our", "our.com…"]) {
    expect(texts(`tools for our clients at ${token}`).join(" ")).toBe(`tools for its clients at ${token}`);
  }
});

it("does not backtrack catastrophically on long punctuation runs", () => {
  for (const run of [`a${".".repeat(50000)}x`, "…".repeat(50000)]) {
    const started = performance.now();
    factualBullets(`We provide ${run}`, "Lumen Ledger");
    expect(performance.now() - started).toBeLessThan(200);
  }
});

it("keeps literal tokens wrapped in Markdown emphasis or code spans, with the complete sentence", () => {
  for (const token of ["**our.com**", "`our.com`", "_our.com_", "~~our.com~~", "**our@example.com**"]) {
    expect(texts(`links to ${token} for our clients.`)).toEqual([`links to ${token} for its clients.`]);
  }
  expect(factualBullets("We provide links to `https://x.io/our` for our clients.", "Lumen Ledger"))
    .toEqual([{ text: "We provide links to `https://x.io/our` for our clients.", label: "Company statement" }]);
  expect(texts("links for **our** clients.")).toEqual(["links for **its** clients."]);
});

it("shows an emphasised literal domain in the document projection and DOCX", async () => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.offerings[0].description = "We offer links to **our.com** for our clients.";
  const paragraphs = documentParagraphs({ kind: "snapshot", snapshot });
  expect(paragraphs.some((p) => p.text === "links to **our.com** for its clients.")).toBe(true);
  const zip = await JSZip.loadAsync(await renderKnowledgeDocument({ kind: "snapshot", snapshot }));
  const text = load(await zip.file("word/document.xml")!.async("string"), { xmlMode: true }).text();
  expect(text).toContain("our.com");
  expect(text).not.toContain("its.com");
});
