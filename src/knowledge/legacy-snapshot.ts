/**
 * Snapshots are immutable. Those published before the `site_links` kind (migration 0017) have neither the section nor
 * its coverage row. Readers upgrade a copy before validating; the stored payload, its hash and JSON downloads never change.
 */
export function upgradeLegacySnapshot(stored: unknown): unknown {
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || Object.hasOwn(stored, "site_links")) return stored;
  const snapshot = stored as Record<string, unknown>;
  const provenance = snapshot.provenance as Record<string, unknown> | null | undefined;
  const coverage = provenance && typeof provenance === "object" && Array.isArray(provenance.coverage) ? provenance.coverage : null;
  return {
    ...snapshot,
    site_links: { links: [] },
    ...(coverage ? { provenance: { ...provenance, coverage: [
      ...coverage,
      { targets: ["/site_links/links"], status: "not_checked", job_id: null, reason: "No approved entry assessed this field." },
    ] } } : {}),
  };
}
