import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, type PDFFont, type PDFPage, PageSizes, rgb } from "pdf-lib";
import { canonicalStringify } from "./canonical-json";
import { documentData, documentParagraphs, documentRuns, type DocumentInput, type DocumentParagraph } from "./document-export";

/** Stored URLs are user text: only http(s), normalised, with PDF string delimiters percent-encoded so they cannot end the string. */
function safePdfUri(href: string): string | undefined {
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.href.replace(/[()\\]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return undefined;
  }
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
    const code = character.codePointAt(0) ?? 0;
    if (/[\r\n\t]/.test(character) || supported.has(code)) {
      return character;
    }
    substituted = true;
    return `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
  }).join("");
  const paragraphs = documentParagraphs(input);
  // Inspect before drawing so the note is shown only when it is needed.
  paragraphs.forEach((paragraph) => displayText(paragraph.text));
  if (substituted) {
    paragraphs.splice(3, 0, { text: "Characters unavailable in the embedded font appear as [U+XXXX]. The attached knowledge.json preserves the original characters exactly.", depth: 0, muted: true });
  }
  interface Span { text: string; font: PDFFont; size: number; raise: number; source?: number; href?: string }
  interface Line { spans: (Span & { x: number; width: number })[]; width: number }
  const measure = (span: Span) => span.font.widthOfTextAtSize(span.text, span.size);
  const layout = (paragraph: DocumentParagraph, font: PDFFont, size: number, width: number): Line[] => {
    const tokens: (Span[] | null)[] = [];
    for (const run of documentRuns(paragraph)) {
      for (const token of displayText(run.text).match(/\r\n|\r|\n|[^\S\r\n]+|[^\s]+/gu) ?? []) {
        tokens.push(/[\r\n]/.test(token) ? null : [{ text: token, font: run.bold ? bold : font, size, raise: 0, href: run.href }]);
      }
      if (run.citations?.length) {
        const note = (text: string, source?: number): Span => ({ text, source, font: regular, size: 7, raise: size * 0.3 });
        const markers = [note(" ["), ...run.citations.flatMap((number, index) => [
          ...(index ? [note(",")] : []), note(String(number), number),
        ]), note("]")];
        const previous = tokens.at(-1);
        // Keep an ordinary final word and its note together when wrapping.
        if (previous?.some((span) => /\S/.test(span.text))) {
          previous.push(...markers);
        } else {
          tokens.push(markers);
        }
      }
    }
    const lines: Line[] = [];
    let line: Line = { spans: [], width: 0 };
    const flush = () => { lines.push(line); line = { spans: [], width: 0 }; };
    const append = (span: Span) => {
      const spanWidth = measure(span);
      if (!line.spans.length && /^\s+$/.test(span.text)) {
        return;
      }
      const previous = line.spans.at(-1);
      if (previous && previous.font === span.font && previous.size === span.size && previous.raise === span.raise
        && previous.source === span.source && previous.href === span.href) {
        previous.text += span.text;
        previous.width += spanWidth;
      } else {
        line.spans.push({ ...span, x: line.width, width: spanWidth });
      }
      line.width += spanWidth;
    };
    for (const token of tokens) {
      if (token === null) { flush(); continue; }
      const tokenWidth = token.reduce((sum, span) => sum + measure(span), 0);
      if (tokenWidth <= width) {
        if (line.width + tokenWidth > width) {
          flush();
        }
        token.forEach(append);
      } else {
        // Very long URLs/words can span pages, with each styled fragment measured separately.
        for (const span of token) {
          for (const character of span.source ? [span.text] : Array.from(span.text)) {
          const fragment = { ...span, text: character };
          if (line.width + measure(fragment) > width && line.spans.length) {
            flush();
          }
          append(fragment);
        }
        }
      }
    }
    if (line.spans.length || !lines.length) {
      flush();
    }
    return lines;
  };
  const margin = 43.2;
  let page = pdf.addPage(PageSizes.Letter);
  let y = page.getHeight() - margin;
  const newPage = () => { page = pdf.addPage(PageSizes.Letter); y = page.getHeight() - margin; };
  const anchors = new Map<string, { page: PDFPage; y: number }>();
  const links: { page: PDFPage; rect: number[]; source?: number; href?: string }[] = [];
  const paintLine = (line: Line, x: number, top: number, size: number, color = rgb(0.13, 0.16, 0.2)) => {
    for (const span of line.spans) {
      const baseline = top - size + span.raise;
      page.drawText(span.text, { x: x + span.x, y: baseline, size: span.size, font: span.font,
        color: span.source || span.raise || span.href ? rgb(0.13, 0.41, 0.61) : color });
      if (span.source || span.href) {
        links.push({ page, source: span.source, href: span.href,
        rect: [x + span.x, baseline - 1, x + span.x + span.width, baseline + span.size + 1] });
      }
    }
  };
  const paragraphSize = (paragraph: DocumentParagraph) => paragraph.heading === "title" ? 22 : paragraph.heading === "section" ? 16
    : paragraph.heading ? 11.5 : paragraph.muted ? 9 : 10.5;
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    if (paragraph.palette) {
      const cellWidth = (page.getWidth() - margin * 2) / 4;
      for (let offset = 0; offset < paragraph.palette.length; offset += 4) {
        if (y - 36 < margin) {
          newPage();
        }
        for (const [column, color] of paragraph.palette.slice(offset, offset + 4).entries()) {
          const x = margin + column * cellWidth;
          const components = [1, 3, 5].map((start) => Number.parseInt(color.hex.slice(start, start + 2), 16) / 255);
          page.drawRectangle({ x, y: y - 24, width: 24, height: 24,
            color: rgb(components[0], components[1], components[2]), borderColor: rgb(0.53, 0.57, 0.61), borderWidth: 0.5 });
          const label = { text: color.hex, citations: color.citations, depth: 0 };
          const lines = layout(label, regular, 10.5, cellWidth - 39);
          for (const [index, line] of lines.entries()) {
            paintLine(line, x + 31, y - 5 - index * 14.91, 10.5);
          }
        }
        y -= 36;
      }
      y -= 6;
      continue;
    }
    const isTitle = paragraph.heading === "title";
    const isSection = paragraph.heading === "section";
    const isHeading = Boolean(paragraph.heading);
    const size = paragraphSize(paragraph);
    const font = isHeading ? bold : regular;
    const lineHeight = size * 1.42;
    const before = isSection ? 15 : isHeading && !isTitle ? 7 : 0;
    const x = margin + Math.min(paragraph.depth, 4) * 8 + (paragraph.bullet ? 12 : 0);
    const lines = layout(paragraph, font, size, page.getWidth() - x - margin);
    let required = before + lineHeight;
    if (isHeading) {
      required = before + lines.length * lineHeight + 6;
      for (const next of paragraphs.slice(paragraphIndex + 1)) {
        const nextSize = paragraphSize(next);
        if (next.palette) { required += 36; break; }
        if (!next.heading) { required += nextSize * 1.42; break; }
        const nextX = margin + Math.min(next.depth, 4) * 8;
        required += (next.heading === "section" ? 15 : 7) + layout(next, bold, nextSize, page.getWidth() - nextX - margin).length * nextSize * 1.42 + 6;
      }
    }
    if (y - Math.min(required, page.getHeight() - margin * 2) < margin) {
      newPage();
    }
    y -= before;
    const color = isTitle ? rgb(0.09, 0.23, 0.36) : isSection ? rgb(0.13, 0.41, 0.61)
      : paragraph.muted ? rgb(0.38, 0.42, 0.46) : rgb(0.13, 0.16, 0.2);
    for (const [index, line] of lines.entries()) {
      if (y - lineHeight < margin) {
        newPage();
      }
      if (index === 0 && paragraph.anchor) {
        anchors.set(paragraph.anchor, { page, y });
      }
      const lineX = isTitle ? (page.getWidth() - line.width) / 2 : x;
      if (paragraph.bullet && index === 0) {
        page.drawText("•", { x: x - 12, y: y - size, font: regular, size, color });
      }
      paintLine(line, lineX, y, size, color);
      y -= lineHeight;
    }
    if (isTitle) {
      y -= 10;
      page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.8, color: rgb(0.13, 0.41, 0.61) });
      y -= 10;
    }
    y -= isHeading ? 6 : 7;
  }
  for (const link of links) {
    const uri = link.href === undefined ? undefined : safePdfUri(link.href);
    if (link.href !== undefined && !link.source && !uri) {
      continue;
    }
    const destination = link.source ? anchors.get(`source_${link.source}`) : undefined;
    if (link.source && !destination) {
      throw new Error("Missing source destination");
    }
    const annotation = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: link.rect, Border: [0, 0, 0],
      ...(destination ? { Dest: [destination.page.ref, PDFName.of("XYZ"), margin, destination.y, null] }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- a link without a source destination always has a safe uri (unsafe ones are skipped above)
        : { A: { S: "URI", URI: PDFString.of(uri!) } }),
    });
    link.page.node.addAnnot(pdf.context.register(annotation));
  }
  await pdf.attach(Buffer.from(canonicalStringify(documentData(input)), "utf8"), "knowledge.json", {
    mimeType: "application/json", description: "Complete original saved data and source provenance",
  });
  pdf.setTitle(`${paragraphs[0].text} — company profile`);
  pdf.setAuthor("MoFloKnowledge");
  return pdf.save();
}
