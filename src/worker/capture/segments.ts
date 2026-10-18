import { createHash } from 'node:crypto';
export interface TextSegment {
    id: string;
    text: string;
    heading?: string;
}
export function normalizeText(text: string): string { return text.replace(/\u00a0/g, ' ').replace(/[\t \f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
export function makeSegments(parts: {
    text: string;
    heading?: string;
}[], maxCharacters = 100000): {
    segments: TextSegment[];
    text: string;
    truncated: boolean;
} {
    let remaining = maxCharacters, truncated = false;
    const segments: TextSegment[] = [];
    for (const part of parts) {
        const cleaned = normalizeText(part.text);
        if (!cleaned) {
          continue;
        }
        const text = cleaned.slice(0, Math.max(0, remaining));
        if (text) {
          segments.push({ id: `s${segments.length + 1}`, text, ...(part.heading ? { heading: part.heading } : {}) });
        }
        remaining -= text.length + 1;
        if (text.length < cleaned.length || remaining < 0) {
            truncated = true;
            break;
        }
    }
    return { segments, text: segments.map(s => s.text).join('\n'), truncated };
}
export function hashCapture(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
