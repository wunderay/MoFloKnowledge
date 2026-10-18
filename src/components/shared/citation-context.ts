import { CitationContextSchema, type CitationContext } from "@/contracts";

/** Display-only lookup. Never merge this into an entry's saved provenance. */
export function mergeCitationContexts(
  ...contexts: (CitationContext | undefined)[]
): CitationContext {
  const present = contexts.filter((item): item is CitationContext => !!item);
  return {
    claims: [
      ...new Map(
        present.flatMap((item) => item.claims).map((item) => [item.id, item]),
      ).values(),
    ],
    evidence: [
      ...new Map(
        present.flatMap((item) => item.evidence).map((item) => [item.id, item]),
      ).values(),
    ],
    sources: [
      ...new Map(
        present.flatMap((item) => item.sources).map((item) => [item.id, item]),
      ).values(),
    ],
  };
}

export function readCitationContext(
  value: unknown,
): CitationContext | undefined {
  const parsed = CitationContextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
