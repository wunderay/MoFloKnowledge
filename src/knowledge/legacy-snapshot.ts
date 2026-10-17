import { createEntryDefault } from "../contracts/defaults";
import type { EntryKind } from "../contracts/business";
/**
 * Snapshots are immutable. Those published before the `site_links` kind (migration 0017) have neither the section nor
 * its coverage row, and those published before migration 0019 lack revenue, phone, age, nationality, portrait and
 * images and their coverage rows. Readers upgrade a copy before validating: each missing field takes its default and is
 * covered as not checked. The stored payload, its hash and JSON downloads never change.
 */
const ADDED_FIELDS: Partial<Record<EntryKind, string[]>> = {
  company_foundation: ["revenue"],
  online_presence: ["phone"],
  key_person: ["age", "nationality", "portrait"],
  offering: ["images"],
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
export function upgradeLegacySnapshot(stored: unknown): unknown {
  if (!isObject(stored)) return stored;
  const targets: string[] = [];
  /** The entry with its missing added fields at their defaults; stored fields keep their place and value. */
  const fill = (kind: EntryKind, value: unknown, root: string): unknown => {
    if (!isObject(value)) return value;
    const defaults = createEntryDefault(kind) as unknown as Record<string, unknown>;
    const missing = (ADDED_FIELDS[kind] ?? []).filter((field) => !Object.hasOwn(value, field));
    targets.push(...missing.map((field) => `${root}/${field}`));
    return { ...value, ...Object.fromEntries(missing.map((field) => [field, defaults[field]])) };
  };
  const items = (kind: EntryKind, value: unknown, root: string): unknown =>
    Array.isArray(value) ? value.map((item) => fill(kind, item, isObject(item) ? `${root}/@${item.id}` : root)) : value;
  if (!Object.hasOwn(stored, "site_links")) targets.push("/site_links/links");
  const upgraded = {
    ...stored,
    site_links: Object.hasOwn(stored, "site_links") ? stored.site_links : { links: [] },
    company_foundation: fill("company_foundation", stored.company_foundation, "/company_foundation"),
    online_presence: fill("online_presence", stored.online_presence, "/online_presence"),
    key_people: items("key_person", stored.key_people, "/key_people"),
    offerings: items("offering", stored.offerings, "/offerings"),
  };
  const provenance = isObject(stored.provenance) ? stored.provenance : null;
  const coverage = provenance && Array.isArray(provenance.coverage) ? provenance.coverage : null;
  if (!provenance || !coverage) return upgraded;
  const covered = new Set(coverage.flatMap((row) => (Array.isArray(row?.targets) ? row.targets : [])));
  return {
    ...upgraded,
    provenance: { ...provenance, coverage: [
      ...coverage,
      ...targets.filter((target) => !covered.has(target)).map((target) => ({
        targets: [target], status: "not_checked", job_id: null, reason: "No approved entry assessed this field.",
      })),
    ] },
  };
}
