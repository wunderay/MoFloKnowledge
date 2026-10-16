/** Sentence selection copies complete source spans; it never rewrites their claims. */
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

export function exactSentences(text: string): string[] {
  return [...sentenceSegmenter.segment(text)].map((part) => part.segment.trim()).filter(Boolean);
}

export type ExcerptOptions = {
  accept?: (sentence: string, index: number) => boolean;
  maxSentences?: number;
  /** A soft assembly budget: retain a complete first qualifying sentence even if longer. */
  maxCharacters?: number;
};

export function selectExactSentences(text: string, options: ExcerptOptions = {}): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  const maxSentences = options.maxSentences ?? 2;
  const maxCharacters = options.maxCharacters ?? 800;
  for (const [index, sentence] of exactSentences(text).entries()) {
    if (selected.length >= maxSentences) break;
    if (options.accept && !options.accept(sentence, index)) continue;
    const key = sentence.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    if (selected.length && [...selected, sentence].join(" ").length > maxCharacters) continue;
    selected.push(sentence);
    seen.add(key);
  }
  return selected;
}
