/** Sentence selection copies complete source spans; it never rewrites their claims. */
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

export function exactSentences(text: string): string[] {
  return [...sentenceSegmenter.segment(text)].map((part) => part.segment.trim()).filter(Boolean);
}

export interface ExcerptOptions {
  accept?: (sentence: string, index: number) => boolean;
  maxSentences?: number;
  /** A soft assembly budget: retain a complete first qualifying sentence even if longer. */
  maxCharacters?: number;
}

export function selectExactSentences(text: string, options: ExcerptOptions = {}): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  const maxSentences = options.maxSentences ?? 2;
  const maxCharacters = options.maxCharacters ?? 800;
  for (const [index, sentence] of exactSentences(text).entries()) {
    if (selected.length >= maxSentences) {
      break;
    }
    if (options.accept && !options.accept(sentence, index)) {
      continue;
    }
    const key = sentence.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    if (selected.length && [...selected, sentence].join(" ").length > maxCharacters) {
      continue;
    }
    selected.push(sentence);
    seen.add(key);
  }
  return selected;
}

/** Simple clause-level negation/exclusion cue: not, never, except, excluding, don't, and "provide no/without X". */
export const hasNegation = (text: string): boolean =>
  /\b(?:not|never|except|excluding|excludes?|(?:do|does|did|is|are|can|will)n['’]t|cannot)\b/i.test(text) ||
  // "provide no X" / "provide services without X" negate the offer; "with no hidden fees" or "grow without hiring" do not.
  /\b(?:provide|offer|perform|handle|serve)s?\s+(?:\w+\s+)?(?:no|without)\b/i.test(text);

/** Normalize only a company's explicit present-tense statement that it provides services. */
export function isExplicitServiceProviderSentence(sentence: string, companyNames: readonly string[] = []): boolean {
  if (/\b(?:if|would|could|may|might|unlike|other companies|other firms)\b/i.test(sentence) || hasNegation(sentence)) {
    return false;
  }
  const names = companyNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const subject = "(?:we(?: also)?" + (names.length ? "|" + names.join("|") : "") + ")";
  return new RegExp("^" + subject + "\\s+(?:provide|provides|offer|offers)\\s+[^.!?]{2,300}\\bservices\\b", "i").test(sentence.trim());
}
