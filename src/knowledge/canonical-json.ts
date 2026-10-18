/** Canonical UTF-8 JSON: code-unit sorted object keys, unchanged array order, ECMAScript JSON primitives. */
export function canonicalStringify(value: unknown): string {
  const seen = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) {
      return "null";
    }
    if (typeof item === "string" || typeof item === "boolean") {
      return JSON.stringify(item);
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) {
        throw new Error("Canonical JSON requires finite numbers");
      }
      return JSON.stringify(item);
    }
    if (typeof item !== "object") {
      throw new Error(
        "Canonical JSON excludes undefined, functions, symbols and bigint",
      );
    }
    if (seen.has(item)) {
      throw new Error("Canonical JSON cannot contain cycles");
    }
    seen.add(item);
    let result: string;
    if (Array.isArray(item)) {
      result = `[${Array.from(item, encode).join(",")}]`;
    } else {
      if (
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      ) {
        throw new Error("Canonical JSON requires plain objects");
      }
      result = `{${Object.keys(item)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${encode((item as Record<string, unknown>)[key])}`,
        )
        .join(",")}}`;
    }
    seen.delete(item);
    return result;
  }
  return encode(value);
}
export async function canonicalHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
