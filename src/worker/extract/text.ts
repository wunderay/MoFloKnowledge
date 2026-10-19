/** Runs of whitespace collapsed to single spaces, trimmed. */
export const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

/** A lower-case comparison key for a name: "&" read as "and", punctuation dropped, spaces collapsed. */
export const nameKey = (value: string) => value.toLowerCase().replace(/&/g, " and ")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

/** Claim note for a year or place taken from a founder's own first-person sentence. */
export const FOUNDER_STATEMENT_NOTE = "From the founder's statement";
/** A founder's first-person start of their own practice: "since 2003, my own practice in <place>" or "I founded the firm in 2003". */
export function founderStatement(sentence: string): { year: number; place: string | null } | null {
  const since = /\bsince\s+(\d{4})\s*,?\s*(?:my|our) own\s+(?:[\p{L}-]+\s+){0,3}(?:practice|firm|company|business|agency)\b(?:\s+(?:in|throughout|across)\s+([^.!?;,]{2,60}))?/iu.exec(sentence);
  const founded = /\bI\s+(?:founded|started|established)\s+(?:it|the\s+(?:[\p{L}-]+\s+){0,2}(?:practice|firm|company|business|agency)|(?:my|our)\s+(?:own\s+)?(?:[\p{L}-]+\s+){0,3}(?:practice|firm|company|business|agency))\s+in\s+(\d{4})\b/iu.exec(sentence);
  const match = since ?? founded;
  if (!match || /\b(?:former|previous|prior|old|sold|closed|before joining)\b/i.test(sentence)) {
    return null;
  }
  const year = Number(match[1]);
  return year >= 1000 && year <= new Date().getUTCFullYear() ? { year, place: since?.[2]?.trim() ?? null } : null;
}

/** An employee count written as a whole number or a range ("25-50", "25 to 50 people"); the wording is kept as `raw`. */
export function parseEmployeeCount(employee: string) {
  const integer = "(?:0|[1-9]\\d*|[1-9]\\d{0,2}(?:,\\d{3})+)";
  const units = "(?:\\s*(?:employees|people|staff(?: members)?))?";
  const numericText = employee.replace(/\.$/, "");
  const exact = new RegExp("^(" + integer + ")" + units + "$", "i").exec(numericText);
  const range = new RegExp("^(" + integer + ")\\s*(?:[-–—]|to)\\s*(" + integer + ")" + units + "$", "i").exec(numericText);
  const number = (raw: string) => Number(raw.replace(/,/g, ""));
  const exactNumber = exact ? number(exact[1]) : null;
  const min = range ? number(range[1]) : null, max = range ? number(range[2]) : null;
  const validRange = min !== null && max !== null &&
    Number.isSafeInteger(min) && Number.isSafeInteger(max) && min <= max;
  return {
    raw: employee, exact: Number.isSafeInteger(exactNumber) ? exactNumber : null,
    min: validRange ? min : null, max: validRange ? max : null, as_of: null,
  };
}

/** Not a person: an e-mail or URL, a @handle, a token with digits or underscores, or one all-lowercase word. */
export const isPersonName = (name: string) => !/[@\d_/]/.test(name) && !(!/\s/.test(name.trim()) && name === name.toLowerCase());
/** Marks the fixed category of a structurally detected offering. */
export const STRUCTURAL_CATEGORY_NOTE = "Structural offering category";
