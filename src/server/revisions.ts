import "server-only";
import {
  createEmptyProvenance,
  createEntryDefault,
  parseBusinessEntry,
  entryBusiness,
  requiredCoverageTargets,
  enumerateFactualLeaves,
  resolveStablePointer,
  type EntryKind,
  type EntryProvenance,
  type BusinessEntry,
} from "../contracts";
import { reviseProvenance } from "../knowledge/revise-provenance";
import { stableId } from "../lib/identity";
import { canonicalStringify } from "../knowledge/canonical-json";
import { checked } from "./read-model";
import { HttpError } from "./http";
import type { verifiedSession } from "../lib/supabase/server";
type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];
export function prepareManualCreation(
  kind: EntryKind,
  content: BusinessEntry,
  requestId: string,
  actorId: string,
  genderAttestation?: string,
) {
  const id = "id" in content ? content.id : requestId;
  const provenance = createEmptyProvenance();
  provenance.coverage = requiredCoverageTargets(
    entryBusiness(kind, content),
  ).map((target) => ({
    targets: [target],
    status: "not_checked" as const,
    job_id: null,
    reason: "Entered manually; website extraction has not assessed this field.",
  }));
  let sequence = 0;
  return reviseProvenance({
    newId: () => stableId(requestId, String(sequence++)),
    kind,
    entryId: id,
    before: createEntryDefault(kind, id),
    after: content,
    provenance,
    actorId,
    savedAt: new Date().toISOString(),
    requestId,
    note: genderAttestation
      ? `User attestation of explicit self-description: ${genderAttestation}`
      : "User-provided manual entry.",
  });
}
export async function prepareRevision(
  client: Client,
  companyId: string,
  entryId: string,
  actorId: string,
  input: {
    expectedRevision: number;
    content: BusinessEntry;
    provenance: EntryProvenance;
    reason?: string;
    requestId: string;
    reviewStatus: string;
    genderAttestation?: string;
  },
) {
  const entry = await checked(
    client
      .from("knowledge_entries")
      .select("kind,current_revision")
      .eq("company_id", companyId)
      .eq("id", entryId)
      .maybeSingle(),
  );
  if (!entry) throw new HttpError(404, "unavailable", "Resource unavailable.");
  // Read the requested base, including on replay. SQL owns concurrency/idempotency under its lock.
  const previous = await checked(
    client
      .from("knowledge_entry_versions")
      .select("content,provenance")
      .eq("company_id", companyId)
      .eq("entry_id", entryId)
      .eq("revision", input.expectedRevision)
      .maybeSingle(),
  );
  if (!previous)
    throw new HttpError(
      409,
      "conflict",
      "The saved revision changed. Refresh and compare your changes.",
      { currentRevision: entry.current_revision },
    );
  const kind = entry.kind as EntryKind;
  const content = parseBusinessEntry(kind, input.content);
  const stored = previous.provenance as EntryProvenance;
  const provenance = structuredClone(stored);
  // Browser cannot replace current evidence, candidate content or operation history.
  // Only explicit decisions against existing conflicts are accepted.
  provenance.decisions = input.provenance.decisions.map((decision) => {
    const prior = stored.decisions.find((d) => d.id === decision.id);
    if (prior && canonicalStringify(prior) === canonicalStringify(decision))
      return prior;
    if (!stored.conflicts.some((c) => c.id === decision.conflict_id))
      throw new HttpError(
        422,
        "invalid_decision",
        "Conflict decision is unavailable.",
      );
    return {
      ...decision,
      actor_id: actorId,
      decided_at: new Date().toISOString(),
    };
  });
  let sequence = 0;
  const changed =
    canonicalStringify(previous.content) !== canonicalStringify(content);
  const revised = changed
    ? reviseProvenance({
        newId: () => stableId(input.requestId, String(sequence++)),
        kind,
        entryId,
        before: parseBusinessEntry(kind, previous.content),
        after: content,
        provenance,
        actorId,
        savedAt: new Date().toISOString(),
        requestId: input.requestId,
        note: input.genderAttestation
          ? `User attestation of explicit self-description: ${input.genderAttestation}`
          : (input.reason ?? "User-provided correction."),
      })
    : provenance;
  return {
    content,
    provenance: preserveSelectedCandidates(
      kind,
      content,
      revised,
      stored,
      entryId,
      input.requestId,
    ),
  };
}

export function preserveSelectedCandidates(
  kind: EntryKind,
  content: BusinessEntry,
  provenance: EntryProvenance,
  stored: EntryProvenance,
  entryId: string,
  requestId: string,
): EntryProvenance {
  const business = entryBusiness(kind, content);
  for (const decision of provenance.decisions.filter(
    (d) => d.action === "select",
  )) {
    const conflict = stored.conflicts.find(
      (c) => c.id === decision.conflict_id,
    );
    const candidate = conflict?.candidates.find(
      (c) => c.id === decision.candidate_id,
    );
    const existing = stored.decisions.find((d) => d.id === decision.id);
    if (
      existing &&
      canonicalStringify(existing) === canonicalStringify(decision)
    ) {
      if (
        conflict &&
        candidate &&
        canonicalStringify(resolveStablePointer(business, conflict.target)) !==
          canonicalStringify(candidate.value)
      ) {
        const index = provenance.decisions.indexOf(decision);
        provenance.decisions[index] = {
          ...decision,
          id: stableId(requestId, conflict.id, "correct"),
          action: "correct",
          candidate_id: null,
          decided_at: new Date().toISOString(),
          note: "User corrected a previously selected candidate.",
        };
      }
      continue;
    }
    if (
      !conflict ||
      !candidate ||
      canonicalStringify(resolveStablePointer(business, conflict.target)) !==
        canonicalStringify(candidate.value)
    )
      throw new HttpError(
        422,
        "invalid_decision",
        "Selected value does not match the saved candidate.",
      );
    const under = (target: string) =>
      target === conflict.target || target.startsWith(conflict.target + "/");
    provenance.claims = provenance.claims
      .map((claim) => ({
        ...claim,
        targets: claim.targets.filter((target) => !under(target)),
      }))
      .filter((claim) => claim.targets.length > 0);
    for (const leaf of enumerateFactualLeaves(business).filter((leaf) =>
      under(leaf.path),
    ))
      provenance.claims.push({
        id: stableId(requestId, leaf.path, "selected"),
        entry_id: entryId,
        targets: [leaf.path],
        origin: candidate.origin,
        evidence_ids: candidate.evidence_ids,
        based_on_claim_ids: candidate.based_on_claim_ids,
        actor_id:
          candidate.origin === "user_provided" ? decision.actor_id : null,
        authored_at:
          candidate.origin === "user_provided" ? decision.decided_at : null,
        note: decision.note ?? "Reviewer selected the supported candidate.",
      });
  }
  const referenced = new Set([
    ...provenance.claims.flatMap((c) => c.evidence_ids),
    ...provenance.conflicts.flatMap((c) =>
      c.candidates.flatMap((v) => v.evidence_ids),
    ),
  ]);
  provenance.evidence = stored.evidence.filter((e) => referenced.has(e.id));
  const sourceIds = new Set(provenance.evidence.map((e) => e.source_page_id));
  provenance.sources = stored.sources.filter((s) => sourceIds.has(s.id));
  return provenance;
}
