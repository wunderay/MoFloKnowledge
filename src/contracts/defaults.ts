import defaults from "./defaults.json";
import type { Business, EntryKind, BusinessEntry } from "./business";
import type { EntryProvenance } from "./provenance";
export function createEmptyBusiness(): Business {
  return structuredClone(defaults) as Business;
}
/** Empty repeatable entries are editor drafts and must acquire content before parsing/saving. */
export function createEntryDefault(
  kind: EntryKind,
  id?: string,
): BusinessEntry {
  if (kind === "key_person")
    return {
      id: id ?? crypto.randomUUID(),
      name: null,
      title: null,
      role: null,
      gender: null,
      background_or_relevance: null,
      age: null,
      nationality: null,
      portrait: null,
    };
  if (kind === "offering")
    return {
      id: id ?? crypto.randomUUID(),
      name: null,
      description: null,
      offering_type: null,
      category: null,
      features: [],
      pricing: null,
      url: null,
      images: [],
    };
  return createEmptyBusiness()[kind];
}
export function createEmptyProvenance(): EntryProvenance {
  return {
    sources: [],
    evidence: [],
    claims: [],
    coverage: [],
    operations: [],
    conflicts: [],
    decisions: [],
  };
}
