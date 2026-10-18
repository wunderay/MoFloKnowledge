/** Runs of whitespace collapsed to single spaces, trimmed. */
export const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

/** A lower-case comparison key for a name: "&" read as "and", punctuation dropped, spaces collapsed. */
export const nameKey = (value: string) => value.toLowerCase().replace(/&/g, " and ")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
