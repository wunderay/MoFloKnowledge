import "server-only";
import {
  EntryProvenanceSchema,
  type EntryProvenance,
  type Claim,
  type Evidence,
} from "../contracts";
import type { verifiedSession } from "../lib/supabase/server";
import { HttpError, mapDatabaseError } from "./http";

type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];

/** Display-only immutable support; never merge this into an entry's saved claims. */
export async function readCitationContext(
  client: Client,
  companyId: string,
  roots: EntryProvenance[],
  current: EntryProvenance[] = roots,
) {
  const available = new Map<
    string,
    { claim: Claim; provenance: EntryProvenance }
  >();
  const add = (provenance: EntryProvenance) => {
    for (const claim of provenance.claims) {
      if (!available.has(claim.id)) {
        available.set(claim.id, { claim, provenance });
      }
    }
  };
  roots.forEach(add);
  current.forEach(add);
  const claims = new Map<string, Claim>();
  const evidence = new Map<string, Evidence>();
  const sources = new Map<string, EntryProvenance["sources"][number]>();
  const pending = roots.flatMap((provenance) =>
    provenance.claims.map((claim) => claim.id),
  );
  let lookups = 0;
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    if (claims.has(id)) {
      continue;
    }
    if (claims.size >= 10000) {
      throw new HttpError(
        503,
        "invalid_state",
        "Citation context is temporarily unavailable.",
      );
    }
    let found = available.get(id);
    if (!found) {
      if (++lookups > 1000) {
        throw new HttpError(
          503,
          "invalid_state",
          "Citation context is temporarily unavailable.",
        );
      }
      // Search only immutable revisions containing this exact referenced claim, within the company.
      const result = await client
        .from("knowledge_entry_versions")
        .select("provenance")
        .eq("company_id", companyId)
        .contains("provenance", { claims: [{ id }] })
        .limit(1)
        .maybeSingle();
      if (result.error) {
        throw mapDatabaseError(result.error);
      }
      if (result.data) {
        add(EntryProvenanceSchema.parse(result.data.provenance));
      }
      found = available.get(id);
    }
    if (!found) {
      throw new HttpError(
        503,
        "invalid_state",
        "Citation support is temporarily unavailable.",
      );
    }
    const { claim, provenance } = found;
    claims.set(id, claim);
    pending.push(...claim.based_on_claim_ids);
    for (const evidenceId of claim.evidence_ids) {
      const item = provenance.evidence.find((item) => item.id === evidenceId);
      if (!item) {
        continue;
      }
      evidence.set(item.id, item);
      const source = provenance.sources.find(
        (source) => source.id === item.source_page_id,
      );
      if (source) {
        sources.set(source.id, source);
      }
    }
  }
  return {
    claims: [...claims.values()],
    evidence: [...evidence.values()],
    sources: [...sources.values()],
  };
}
