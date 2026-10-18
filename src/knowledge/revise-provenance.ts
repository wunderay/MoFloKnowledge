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
/** Most targets one claim may name (ClaimSchema). */
export const MAX_CLAIM_TARGETS = 1000;
/** Most claims, and most operations, one entry's provenance may hold (EntryProvenanceSchema). */
export const MAX_ENTRY_CLAIMS = 500;
export const MAX_ENTRY_OPERATIONS = 1000;
/** Operations one save adds: the user_correction here and the save_entry_revision the database records. */
export const OPERATIONS_PER_SAVE = 2;
/** How many claims one save adds for `leaves` newly claimed values: they share claims of up to MAX_CLAIM_TARGETS. */
export const claimsForLeaves = (leaves: number) => Math.ceil(leaves / MAX_CLAIM_TARGETS);
/**
 * One claim per MAX_CLAIM_TARGETS targets in place of one per target. The claims of one save share
 * entry, origin, actor, time and note, so naming their targets together loses nothing, and a list of
 * hundreds of items stays under the 500-claim cap. The ids of the first claim of each group are kept
 * (so retries with a deterministic id generator stay stable).
 */
function groupClaims(created: Claim[]): Claim[] {
  const out: Claim[] = [];
  const targets = created.flatMap((claim) => claim.targets);
  for (let at = 0; at < targets.length; at += MAX_CLAIM_TARGETS) {
    out.push({
      ...created[Math.min(at, created.length - 1)],
      targets: targets.slice(at, at + MAX_CLAIM_TARGETS),
    });
  }
  return out;
}
export interface ReviseInput {
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
}
export function reviseProvenance(input: ReviseInput): EntryProvenance {
  if (!input.note.trim()) {
    throw new Error("Correction note is required");
  }
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
  if (changed.size === 0) {
    return result;
  }
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
    if (targets.length) {
      claims.push({ ...claim, targets });
    }
  }
  const created: Claim[] = [];
  for (const target of changed) {
    let value: unknown;
    try {
      value = resolveStablePointer(after, target);
    } catch {
      continue;
    }
    if (value !== null && typeof value === "object") {
      continue;
    }
    created.push({
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
  claims.push(...groupClaims(created));
  result.claims = claims;
  const refs = new Set([
    ...claims.flatMap((c) => c.evidence_ids),
    ...result.conflicts.flatMap((c) =>
      c.candidates.flatMap((candidate) => candidate.evidence_ids),
    ),
  ]);
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
