import { expect, it } from "vitest";
import JSZip from "jszip";
import { load } from "cheerio";
import fixture from "../contracts/illustrative-export.json";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { documentParagraphs, renderKnowledgeDocument } from "../../src/knowledge/document-export";
import { factualBullets } from "../../src/knowledge/narrative-prose";

const company = "Lumen Ledger";
// Run text through the neutraliser as a "We provide ..." predicate and return the bullet text. A statement the
// module keeps whole (e.g. because a "scheme:" colon is present) comes back with its leading "We provide " stripped
// so both the split and the kept-whole form compare equal; either is acceptable, mangling a token is not.
const neutralised = (tail: string): string =>
  factualBullets(`We provide ${tail}`, company).map((bullet) => bullet.text).join(" ").replace(/^We provide /u, "");

// C1: every literal token survives byte-for-byte.
const literalTokens = [
  "our@example.com", "OUR@EXAMPLE.COM", "Our@Example.com", "mailto:our@example.com", "our.team@example.com", "team@our.example.com",
  "example.com/our-team", "www.our-site.com", "https://ourco.com/our/", "http://our.example.com/our", "ftp://our.example.com/our",
  "https://example.com/path/our#our", "our-team.example.com/our", "example.com/our",
  "@our_brand", "@our", "#our", "#our_team", "#ourbrand",
  "https://bücher.example/our", "our@bücher.example", "https://例え.jp/our", "our@例え.jp",
  "<https://ourco.com/our>", "(www.our-site.com/our)",
];

it.each(literalTokens)("C1: preserves the literal token %s inside a neutralised sentence", (token) => {
  expect(neutralised(`tools for ${token} today.`)).toBe(`tools for ${token} today.`);
});

it.each(literalTokens)("C1: preserves %s at the start and at the end of the predicate", (token) => {
  expect(neutralised(`${token} tools.`)).toBe(`${token} tools.`);
  expect(neutralised(`tools at ${token}`)).toBe(`tools at ${token}`);
});

it.each([
  ["our@example.com."], ["(our@example.com)"], ["example.com/our."], ["www.our-site.com!"], ["https://ourco.com/our/."],
  ["@our_brand."], ["#our_team."], ["OUR@EXAMPLE.COM."],
])("C1: keeps %s when followed or wrapped by punctuation", (token) => {
  expect(neutralised(`tools via ${token}`)).toBe(`tools via ${token}`);
});

it("C1: preserves tokens in the assistance clause too", () => {
  expect(factualBullets("We provide tools, assisting clients at our@example.com www.our-site.com/our.", company)).toEqual([
    { text: "tools", label: "Services provided" },
    { text: "Assisting clients at our@example.com www.our-site.com/our." },
  ]);
});

it("C1: preserves tokens in non-label (verb-led) bullets", () => {
  expect(factualBullets("We can help clients at our@example.com.", company))
    .toEqual([{ text: "Can help clients at our@example.com." }]);
});

it("C1: only the prose word is rewritten when it sits next to a token", () => {
  expect(neutralised("tools on our site example.com/our.")).toBe("tools on its site example.com/our.");
  expect(neutralised("tools from our site at www.our-site.com via our@example.com.")).toBe("tools from its site at www.our-site.com via our@example.com.");
  expect(neutralised("tools for our clients via our@example.com with our staff at #our_team.")).toBe("tools for its clients via our@example.com with its staff at #our_team.");
  // DECISION: only the link target is asserted; link text handling is left to the builder.
  const link = neutralised("tools at [our site](example.com/our) for our clients.");
  expect(link).toContain("](example.com/our)");
  expect(link.endsWith(" for its clients.")).toBe(true);
});

it("C1: a mixed-token sentence leaves every token intact", () => {
  const tokens = "our@example.com OUR@EXAMPLE.COM www.our-site.com example.com/our-team ourco.com/our/ @our_brand #our";
  expect(neutralised(`our tools via ${tokens}.`)).toBe(`its tools via ${tokens}.`);
});

it("C1: first-person words other than 'our' never alter tokens (we/us/ours/ourselves)", () => {
  for (const token of ["we@example.com", "us@example.com", "ours@example.com", "ourselves@example.com", "WE@EXAMPLE.COM", "www.we-are.com/us", "@we_brand", "#ours", "https://us.example.com/ourselves"]) {
    const bullets = factualBullets(`We provide tools at ${token}.`, company);
    expect(bullets.map((b) => b.text).join(" ")).toContain(token);
  }
});

// C2 / C4: non-regression of ordinary prose, mirrored from tests/knowledge/narrative-prose.test.ts.
it("C2: ordinary 'our' prose is still neutralised exactly as before", () => {
  expect(factualBullets("We provide tools for our clients.", "Lumen Ledger"))
    .toEqual([{ text: "tools for its clients.", label: "Services provided" }]);
  expect(factualBullets("We specialize in tax preparation and planning for both individuals and businesses, ensuring our clients navigate the complexities of the tax system with confidence.", company))
    .toEqual([{ text: "tax preparation and planning for both individuals and businesses, ensuring its clients navigate the complexities of the tax system with confidence.", label: "Specialty" }]);
  expect(factualBullets("We offer our software with our training for our support desk.", company))
    .toEqual([{ text: "its software with its training for its support desk.", label: "Services offered" }]);
  expect(factualBullets("We provide tools. Our clients vary.", company).map((b) => b.text)).toEqual(["tools.", "Our clients vary."]);
});

it("C2: 'our' at the very end of a word boundary next to punctuation is still neutralised", () => {
  expect(neutralised("tools (our clients) with our staff.")).toBe("tools (its clients) with its staff.");
  expect(neutralised("tools for our clients with our partners.")).toBe("tools for its clients with its partners.");
});

it("C4: earlier fixed behaviours stay intact", () => {
  for (const text of ["We help each other grow.", "We help one another grow.", "We help each other and one another grow."]) {
    expect(factualBullets(text, company).map((b) => b.text).join(" ")).toBe(text);
  }
  expect(factualBullets("  First complete fact.\n\n \t\nSecond qualified fact.\r\n\r\n  ", company))
    .toEqual([{ text: "First complete fact." }, { text: "Second qualified fact." }]);
  expect(factualBullets(" \n\r\n\t ", company)).toEqual([]);
});

// C3: the fixed output flows unchanged through document export.
const withNarrative = (description: string) => {
  const snapshot = KnowledgeBaseExportSchema.parse(fixture);
  snapshot.offerings[0].description = description;
  return snapshot;
};

it("C3: the shared document projection (used by docx and pdf) shows the literal email and tokens", () => {
  const snapshot = withNarrative("We offer training for our clients at our@example.com. Write to OUR@EXAMPLE.COM.");
  const paragraphs = documentParagraphs({ kind: "snapshot", snapshot });
  expect(paragraphs.some((p) => p.bullet && p.label === "Services offered" && p.text === "training for its clients at our@example.com.")).toBe(true);
  expect(paragraphs.some((p) => p.bullet && p.text === "Write to OUR@EXAMPLE.COM.")).toBe(true);
  const all = paragraphs.map((p) => p.text).join("\n");
  expect(all).not.toContain("its@example.com");
  expect(all).not.toContain("www.its-site.com");
});

it("C3: a rendered docx narrative contains our@example.com literally and never its@example.com", async () => {
  const snapshot = withNarrative("We offer training for our clients at our@example.com.");
  const bytes = await renderKnowledgeDocument({ kind: "snapshot", snapshot });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const text = load(xml, { xmlMode: true }).text();
  expect(text).toContain("our@example.com");
  expect(text).not.toContain("its@example.com");
  expect(text).toContain("training for its clients at our@example.com.");
});
