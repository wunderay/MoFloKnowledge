import type {
  CandidateConflict,
  ConflictDecision,
} from "../contracts/provenance";
import { ConflictDecisionSchema } from "../contracts/provenance";
import {
  parseStablePointer,
  resolveStablePointer,
} from "../contracts/stable-pointer";
export function validateConflictDecision(
  conflict: CandidateConflict,
  input: unknown,
): ConflictDecision {
  const decision = ConflictDecisionSchema.parse(input);
  if (
    decision.conflict_id !== conflict.id ||
    decision.target !== conflict.target
  ) {
    throw new Error("Decision does not match conflict");
  }
  if (
    decision.action === "select" &&
    !conflict.candidates.some((c) => c.id === decision.candidate_id)
  ) {
    throw new Error("Selected candidate is unknown");
  }
  return decision;
}
export function unresolvedConflicts(
  conflicts: CandidateConflict[],
  decisions: ConflictDecision[],
): CandidateConflict[] {
  return conflicts.filter(
    (c) =>
      c.material &&
      !decisions.some((d) => {
        try {
          validateConflictDecision(c, d);
          return true;
        } catch {
          return false;
        }
      }),
  );
}
export function applyConflictDecision<T>(
  business: T,
  conflict: CandidateConflict,
  input: unknown,
  correction?: unknown,
): { business: T; decision: ConflictDecision } {
  const decision = validateConflictDecision(conflict, input);
  const copy = structuredClone(business);
  const segments = parseStablePointer(conflict.target);
  const last = segments.pop();
  if (last === undefined) {
    throw new Error("Cannot replace business root");
  }
  const parentPath = conflict.target.slice(0, conflict.target.lastIndexOf("/"));
  const parent = resolveStablePointer(copy, parentPath);
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    throw new Error("Conflict target must be a business object field");
  }
  if (!Object.hasOwn(parent, last)) {
    throw new Error("Unknown target");
  }
  const current = (parent as Record<string, unknown>)[last];
  const value =
    decision.action === "select"
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the surrounding logic; a runtime check would change failure behaviour
      ? conflict.candidates.find((c) => c.id === decision.candidate_id)!.value
      : decision.action === "clear"
        ? Array.isArray(current)
          ? []
          : null
        : correction;
  if (value === undefined) {
    throw new Error("Correction value required");
  }
  (parent as Record<string, unknown>)[last] = structuredClone(value);
  return { business: copy, decision };
}
