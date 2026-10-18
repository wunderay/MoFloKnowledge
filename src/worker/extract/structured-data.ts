/** JSON-LD blocks followed by microdata items shaped the same way, so one set of rules reads both. */
export function structuredData(raw: Record<string, unknown>): unknown[] {
  const microdata = Array.isArray(raw.microdata) ? raw.microdata.slice(0, 50) as
    { type?: unknown; props?: Record<string, unknown> }[] : [];
  return [
    ...(Array.isArray(raw.jsonLd) ? raw.jsonLd as unknown[] : []),
    ...microdata.flatMap((item) => typeof item.type === "string" && item.props && typeof item.props === "object"
      ? [{ "@type": item.type, ...Object.fromEntries(Object.entries(item.props).flatMap(([name, values]) =>
        Array.isArray(values) && values.length ? [[name, values.length === 1 ? values[0] : values]] : [])) }]
      : []),
  ];
}
