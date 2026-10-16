import "server-only";
import {
  createEmptyProvenance,
  createEntryDefault,
  parseBusinessEntry,
  entryBusiness,
  requiredCoverageTargets,
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
    note: "User-provided manual entry.",
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
  return {
    content,
    provenance: changed
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
          note: input.reason ?? "User-provided correction.",
        })
      : provenance,
  };
}
