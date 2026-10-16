import {
  entryBusiness,
  type BusinessEntry,
  type EntryKind,
} from "../contracts/business";
import type {
  EntryProvenance,
  ReviewStatus,
  Claim,
} from "../contracts/provenance";
import {
  enumerateFactualLeaves,
  resolveStablePointer,
} from "../contracts/stable-pointer";
import { canonicalStringify } from "./canonical-json";
export type ReviseInput = {
  kind: EntryKind;
  entryId: string;
  before: BusinessEntry;
  after: BusinessEntry;
  provenance: EntryProvenance;
  actorId: string;
  savedAt: string;
  requestId: string;
  note: string;
  newId?: () => string;
};
export function reviseProvenance(input: ReviseInput): EntryProvenance {
  if (!input.note.trim()) throw new Error("Correction note is required");
  const result = structuredClone(input.provenance);
  result.conflicts ??= [];
  result.decisions ??= [];
  const before = entryBusiness(input.kind, input.before),
    after = entryBusiness(input.kind, input.after);
  const previous = new Map(
    enumerateFactualLeaves(before).map((l) => [l.path, l.value]),
  );
  const next = new Map(
    enumerateFactualLeaves(after).map((l) => [l.path, l.value]),
  );
  const changed = new Set(
    [...new Set([...previous.keys(), ...next.keys()])].filter(
      (path) => previous.get(path) !== next.get(path),
    ),
  );
  if (changed.size === 0) return result;
  const makeId = input.newId ?? (() => crypto.randomUUID());
  const superseded = new Set<string>();
  const claims: Claim[] = [];
  for (const claim of result.claims) {
    const targets = claim.targets.filter((t) => {
      try {
        resolveStablePointer(after, t);
      } catch {
        superseded.add(claim.id);
        return false;
      }
      if (changed.has(t)) {
        superseded.add(claim.id);
        return false;
      }
      return true;
    });
    if (targets.length) claims.push({ ...claim, targets });
  }
  for (const target of changed) {
    let value: unknown;
    try {
      value = resolveStablePointer(after, target);
    } catch {
      continue;
    }
    if (value !== null && typeof value === "object") continue;
    claims.push({
      id: makeId(),
      entry_id: input.entryId,
      targets: [target],
      origin: "user_provided",
      evidence_ids: [],
      based_on_claim_ids: [],
      actor_id: input.actorId,
      authored_at: input.savedAt,
      note: input.note,
    });
  }
  result.claims = claims;
  const refs = new Set([...claims.flatMap((c) => c.evidence_ids), ...result.conflicts.flatMap(c => c.candidates.flatMap(candidate => candidate.evidence_ids))]);
  result.evidence = result.evidence.filter((e) => refs.has(e.id));
  const sources = new Set(result.evidence.map((e) => e.source_page_id));
  result.sources = result.sources.filter((s) => sources.has(s.id));
  result.operations.push(
    ...(superseded.size ? [...superseded] : [null]).map((id) => ({
      request_id: input.requestId,
      entry_id: input.entryId,
      kind: "user_correction",
      supersedes_claim_id: id,
      note: input.note,
    })),
  );
  result.coverage = result.coverage
    .map((c) => ({
      ...c,
      targets: c.targets.filter((target) => {
        try {
          resolveStablePointer(after, target);
          return true;
        } catch {
          return false;
        }
      }),
    }))
    .filter((c) => c.targets.length);
  return result;
}
export function reviseEntry(
  input: ReviseInput & {
    reviewStatus: ReviewStatus;
    requestedReviewStatus?: ReviewStatus;
  },
): {
  content: BusinessEntry;
  provenance: EntryProvenance;
  review_status: ReviewStatus;
} {
  const changed =
    canonicalStringify(input.before) !== canonicalStringify(input.after);
  return {
    content: structuredClone(input.after),
    provenance: changed
      ? reviseProvenance(input)
      : structuredClone(input.provenance),
    review_status: changed
      ? "unreviewed"
      : (input.requestedReviewStatus ?? input.reviewStatus),
  };
}
