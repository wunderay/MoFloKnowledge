import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, PageSizes, rgb } from "pdf-lib";
import { canonicalStringify } from "./canonical-json";
import { documentData, documentParagraphs, type DocumentInput } from "./document-export";

/** Width-based wrapping, including URLs and other tokens without spaces. No passage/page cap. */
export function wrapPdfText(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const sourceLine of value.replaceAll("\t", "    ").split(/\r\n|\r|\n/)) {
    let line = "";
    let lineWidth = 0;
    for (const token of sourceLine.match(/\S+\s*|\s+/gu) ?? []) {
      const tokenWidth = font.widthOfTextAtSize(token, size);
      if (lineWidth + tokenWidth <= width) {
        line += token;
        lineWidth += tokenWidth;
        continue;
      }
      if (line) lines.push(line.trimEnd());
      line = "";
      lineWidth = 0;
      for (const character of token) {
        const characterWidth = font.widthOfTextAtSize(character, size);
        if (line && lineWidth + characterWidth > width) {
          lines.push(line);
          line = "";
          lineWidth = 0;
        }
        line += character;
        lineWidth += characterWidth;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export async function renderKnowledgePdf(input: DocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontDirectory = join(process.cwd(), "public/fonts");
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(fontDirectory, "NotoSans-Regular.ttf")), readFile(join(fontDirectory, "NotoSans-Bold.ttf")),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  let substituted = false;
  const displayText = (value: string) => Array.from(value, (character) => {
    const code = character.codePointAt(0)!;
    if (/[\r\n\t]/.test(character) || supported.has(code)) return character;
    substituted = true;
    return `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
  }).join("");
  const paragraphs = documentParagraphs(input);
  // Inspect before drawing so the note is shown only when it is needed.
  paragraphs.forEach((paragraph) => displayText(paragraph.text));
  if (substituted) paragraphs.splice(3, 0, { text: "Characters unavailable in the embedded font appear as [U+XXXX]. The attached knowledge.json preserves the original characters exactly.", depth: 0, muted: true });
  let page = pdf.addPage(PageSizes.Letter);
  const margin = 43.2;
  let y = page.getHeight() - margin;
  const newPage = () => {
    page = pdf.addPage(PageSizes.Letter);
    y = page.getHeight() - margin;
  };
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const isTitle = paragraph.heading === "title";
    const isSection = paragraph.heading === "section";
    const isHeading = Boolean(paragraph.heading);
    const size = isTitle ? 22 : isSection ? 16 : isHeading ? 11.5 : paragraph.muted ? 9 : 10.5;
    const font = isHeading ? bold : regular;
    const lineHeight = size * 1.42;
    const before = isSection ? 15 : isHeading && !isTitle ? 7 : 0;
    const prefix = paragraph.label ? `${paragraph.label}: ` : "";
    // Measure fact rows using bold metrics, which also safely fit the regular value text.
    const measureFont = prefix ? bold : font;
    const x = margin + Math.min(paragraph.depth, 4) * 8 + (paragraph.bullet ? 12 : 0);
    const width = page.getWidth() - x - margin;
    const lines = wrapPdfText(displayText(prefix + paragraph.text), measureFont, size, width);
    // Keep consecutive section/item/field headings together with the first content line.
    // A long heading can still span pages; content is never clipped to satisfy this preference.
    let required = before + lineHeight;
    if (isHeading) {
      required = before + lines.length * lineHeight + 6;
      for (let nextIndex = paragraphIndex + 1; nextIndex < paragraphs.length; nextIndex++) {
        const next = paragraphs[nextIndex];
        const nextSize = next.heading === "title" ? 22 : next.heading === "section" ? 16
          : next.heading ? 11.5 : next.muted ? 9 : 10.5;
        if (!next.heading) {
          required += nextSize * 1.42;
          break;
        }
        const nextBefore = next.heading === "section" ? 15 : 7;
        const nextX = margin + Math.min(next.depth, 4) * 8;
        const nextLines = wrapPdfText(displayText(next.text), bold, nextSize, page.getWidth() - nextX - margin);
        required += nextBefore + nextLines.length * nextSize * 1.42 + 6;
      }
    }
    if (y - Math.min(required, page.getHeight() - margin * 2) < margin) newPage();
    y -= before;
    const color = isTitle ? rgb(0.09, 0.23, 0.36) : isSection ? rgb(0.13, 0.41, 0.61)
      : paragraph.muted ? rgb(0.38, 0.42, 0.46) : rgb(0.13, 0.16, 0.2);
    for (const [index, line] of lines.entries()) {
      if (y - lineHeight < margin) newPage();
      const lineX = isTitle ? (page.getWidth() - font.widthOfTextAtSize(line, size)) / 2 : x;
      if (paragraph.bullet && index === 0) page.drawText("•", { x: x - 12, y: y - size, font: regular, size, color });
      if (prefix && index === 0 && line.startsWith(prefix)) {
        page.drawText(prefix, { x: lineX, y: y - size, size, font: bold, color });
        page.drawText(line.slice(prefix.length), { x: lineX + bold.widthOfTextAtSize(prefix, size), y: y - size, size, font: regular, color });
      } else page.drawText(line, { x: lineX, y: y - size, size, font, color });
      y -= lineHeight;
    }
    if (isTitle) {
      y -= 10;
      page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.8, color: rgb(0.13, 0.41, 0.61) });
      y -= 10;
    }
    y -= isHeading ? 6 : 7;
  }
  await pdf.attach(Buffer.from(canonicalStringify(documentData(input)), "utf8"), "knowledge.json", {
    mimeType: "application/json", description: "Complete original saved data and source provenance",
  });
  pdf.setTitle(`${paragraphs[0].text} — company profile`);
  pdf.setAuthor("MoFloKnowledge");
  return pdf.save();
}
