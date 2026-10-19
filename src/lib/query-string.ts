/** A page's URL query, as Next.js passes it to the page. */
export type QueryParams = Record<string, string | string[] | undefined>;

/** `path` with every parameter of `params` kept (a repeated parameter keeps each of its values). */
export function withQuery(path: string, params: QueryParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(name, one);
    }
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
