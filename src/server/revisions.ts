import "server-only";
import {
  createEmptyProvenance,
  createEntryDefault,
  parseBusinessEntry,
  parseStoredEntry,
  entryBusiness,
  requiredCoverageTargets,
  enumerateFactualLeaves,
  resolveStablePointer,
  type EntryKind,
  type EntryProvenance,
  type BusinessEntry,
  type Claim,
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
    restoreFrom?: { revision: number; itemIds: string[] };
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
  if (!entry) {
    throw new HttpError(404, "unavailable", "Resource unavailable.");
  }
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
  if (!previous) {
    throw new HttpError(
      409,
      "conflict",
      "The saved revision changed. Refresh and compare your changes.",
      { currentRevision: entry.current_revision },
    );
  }
  const kind = entry.kind as EntryKind;
  const content = parseBusinessEntry(kind, input.content);
  const stored = previous.provenance as EntryProvenance;
  const provenance = structuredClone(stored);
  // Browser cannot replace current evidence, candidate content or operation history.
  // Only explicit decisions against existing conflicts are accepted.
  provenance.decisions = input.provenance.decisions.map((decision) => {
    const prior = stored.decisions.find((d) => d.id === decision.id);
    if (prior && canonicalStringify(prior) === canonicalStringify(decision)) {
      return prior;
    }
    if (!stored.conflicts.some((c) => c.id === decision.conflict_id)) {
      throw new HttpError(
        422,
        "invalid_decision",
        "Conflict decision is unavailable.",
      );
    }
    return {
      ...decision,
      actor_id: actorId,
      decided_at: new Date().toISOString(),
    };
  });
  let sequence = 0;
  const before = parseStoredEntry(kind, previous.content);
  const changed = canonicalStringify(before) !== canonicalStringify(content);
  const revised = changed
    ? reviseProvenance({
        newId: () => stableId(input.requestId, String(sequence++)),
        kind,
        entryId,
        before,
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
  // An Undo puts items back with the claims and evidence they had; the browser's own provenance is never used for it.
  const restored = input.restoreFrom
    ? await restoreItems(client, companyId, entryId, kind, input.restoreFrom, input.expectedRevision, content, revised, stored, input.requestId)
    : { provenance: revised, stored };
  // An entry saved before a field existed has no coverage for it yet; every registered field needs exactly one row.
  const covered = new Set(restored.provenance.coverage.flatMap((row) => row.targets));
  const covering = {
    ...restored.provenance,
    coverage: [
      ...revised.coverage,
      ...requiredCoverageTargets(entryBusiness(kind, content))
        .filter((target) => !covered.has(target))
        .map((target) => ({
          targets: [target],
          status: "not_checked" as const,
          job_id: null,
          reason: "Entered manually; website extraction has not assessed this field.",
        })),
    ],
  };
  return {
    content,
    provenance: preserveSelectedCandidates(
      kind,
      content,
      covering,
      restored.stored,
      entryId,
      input.requestId,
      actorId,
    ),
  };
}

const dedupe = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

/**
 * Carries the original claims of restored list items over from an earlier revision of the same entry. An item is
 * restored only when every value it has now equals the earlier revision's, it has nothing more, every value had a
 * claim that was not authored by a person, and the claims' evidence and the claims they rest on are still available.
 * Such an item gets claims with the origin, evidence and notes it had (under new ids, since the originals may have
 * been narrowed since), instead of the new claim recording the person as its author. Every other item keeps the
 * claims the ordinary edit gave it. Evidence and sources come from the stored revisions, never from the browser.
 */
async function restoreItems(
  client: Client,
  companyId: string,
  entryId: string,
  kind: EntryKind,
  restore: { revision: number; itemIds: string[] },
  expectedRevision: number,
  content: BusinessEntry,
  revised: EntryProvenance,
  stored: EntryProvenance,
  requestId: string,
): Promise<{ provenance: EntryProvenance; stored: EntryProvenance }> {
  const refuse = () => new HttpError(422, "invalid_restore", "The revision to restore from is unavailable.");
  if (restore.revision >= expectedRevision) {
    throw refuse();
  }
  const earlier = await checked(
    client
      .from("knowledge_entry_versions")
      .select("company_id,entry_id,revision,content,provenance")
      .eq("company_id", companyId)
      .eq("entry_id", entryId)
      .eq("revision", restore.revision)
      .maybeSingle(),
  );
  // A revision of another entry or company is never a source (the query is scoped; the row is checked as well).
  if (earlier?.company_id !== companyId || earlier.entry_id !== entryId || earlier.revision !== restore.revision) {
    throw refuse();
  }
  const before = entryBusiness(kind, parseStoredEntry(kind, earlier.content));
  const after = entryBusiness(kind, content);
  const past = earlier.provenance as EntryProvenance;
  const provenance = structuredClone(revised);
  const present = new Set(provenance.claims.map((claim) => claim.id));
  const claimsOf = (leaves: { path: string }[]) => leaves.map((leaf) => past.claims.find((claim) => claim.targets.includes(leaf.path)));
  const underItem = (id: string) => (leaf: { path: string }) => leaf.path.split("/").includes(`@${id}`);
  const carried = new Map<string, Claim>();
  const restoredPaths = new Set<string>();
  const evidenceIds = new Set<string>();
  for (const id of new Set(restore.itemIds)) {
    const was = enumerateFactualLeaves(before).filter(underItem(id));
    const now = enumerateFactualLeaves(after).filter(underItem(id));
    if (
      was.length === 0 ||
      was.length !== now.length ||
      !was.every((leaf) => now.some((other) => other.path === leaf.path && canonicalStringify(other.value) === canonicalStringify(leaf.value)))
    ) {
      continue;
    }
    const claims = claimsOf(was);
    const sound = claims.every(
      (claim) =>
        claim &&
        claim.origin !== "user_provided" &&
        claim.evidence_ids.every((evidence) => past.evidence.some((row) => row.id === evidence)) &&
        claim.based_on_claim_ids.every((basis) => present.has(basis)),
    );
    if (!sound) {
      continue;
    }
    was.forEach((leaf, index) => {
      const claim = claims[index]!;
      const id = stableId(requestId, claim.id, "restored");
      const have = carried.get(id) ?? { ...claim, id, entry_id: entryId, targets: [] };
      have.targets.push(leaf.path);
      carried.set(id, have);
      restoredPaths.add(leaf.path);
      claim.evidence_ids.forEach((evidence) => evidenceIds.add(evidence));
    });
  }
  if (carried.size === 0) {
    return { provenance: revised, stored };
  }
  provenance.claims = [
    ...provenance.claims
      .map((claim) => ({ ...claim, targets: claim.targets.filter((target) => !restoredPaths.has(target)) }))
      .filter((claim) => claim.targets.length > 0),
    ...carried.values(),
  ];
  const evidence = past.evidence.filter((row) => evidenceIds.has(row.id));
  const sourceIds = new Set(evidence.map((row) => row.source_page_id));
  const sources = past.sources.filter((row) => sourceIds.has(row.id));
  return {
    provenance,
    stored: { ...stored, evidence: dedupe([...stored.evidence, ...evidence]), sources: dedupe([...stored.sources, ...sources]) },
  };
}

export function preserveSelectedCandidates(
  kind: EntryKind,
  content: BusinessEntry,
  provenance: EntryProvenance,
  stored: EntryProvenance,
  entryId: string,
  requestId: string,
  actorId?: string,
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
          actor_id: actorId ?? decision.actor_id,
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
    ) {
      throw new HttpError(
        422,
        "invalid_decision",
        "Selected value does not match the saved candidate.",
      );
    }
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
    )) {
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
