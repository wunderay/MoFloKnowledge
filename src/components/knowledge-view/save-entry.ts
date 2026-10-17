import {
  createEmptyProvenance,
  createEntryDefault,
  entryBusiness,
  requiredCoverageTargets,
  type BusinessEntry,
  type EntryKind,
  type EntryProvenance,
} from "@/contracts";
import { MAX_ENTRY_CLAIMS, MAX_ENTRY_OPERATIONS, reviseProvenance } from "@/knowledge/revise-provenance";
import { api, companyPath, write } from "../api-client";

/** The stored entry a save revises: its id, the revision the page holds, and what it holds. */
export type StoredEntry = {
  id: string;
  revision: number;
  content: BusinessEntry;
  provenance: EntryProvenance;
};

/** The records that say who changed what are capped per entry (the database adds one more operation to a save); a save that would pass a cap is refused with this reason. */
function checkRoom(provenance: EntryProvenance) {
  if (provenance.claims.length > MAX_ENTRY_CLAIMS || provenance.operations.length >= MAX_ENTRY_OPERATIONS)
    throw new Error(
      `This section's source records are full (the maximum of ${MAX_ENTRY_CLAIMS} source claims or ${MAX_ENTRY_OPERATIONS} recorded changes), so it cannot be changed here any more.`,
    );
}

/** A save ready to be sent. Sending it again sends the same request (same request id, revision and content). */
export type PreparedSave = { path: string; init: RequestInit };

/**
 * Prepares saving `content` as the entry of `kind`, the way the editor saves an entry: a new entry when the
 * company has none yet, otherwise a new revision of the stored one (unreviewed again, with `note` as the reason).
 * The provenance names the changed values as the person's own, as the server does with `reviseProvenance`.
 */
export function prepareEntrySave(input: {
  companyId: string;
  actorId: string;
  kind: EntryKind;
  entry: StoredEntry | null;
  content: BusinessEntry;
  note: string;
  /** Put these list items back as the earlier revision had them (an Undo); the server checks and carries their claims over. */
  restoreFrom?: { revision: number; itemIds: string[] };
}): PreparedSave {
  const { companyId, actorId, kind, entry, content, note, restoreFrom } = input;
  const requestId = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  if (!entry || entry.revision === 0) {
    // As prepareManualCreation does: coverage for every required field, then the new values as claims.
    const empty = createEmptyProvenance();
    empty.coverage = requiredCoverageTargets(entryBusiness(kind, content)).map((target) => ({
      targets: [target],
      status: "not_checked" as const,
      job_id: null,
      reason: "Entered manually; website extraction has not assessed this field.",
    }));
    const provenance = reviseProvenance({
      kind,
      entryId: requestId,
      before: createEntryDefault(kind, requestId),
      after: content,
      provenance: empty,
      actorId,
      savedAt,
      requestId,
      note,
    });
    checkRoom(provenance);
    return { path: companyPath(companyId, "/entries"), init: write("POST", { kind, content, provenance, requestId }) };
  }
  const stored = structuredClone(entry.provenance);
  if (!stored.coverage.length)
    stored.coverage = requiredCoverageTargets(entryBusiness(kind, content)).map((target) => ({
      targets: [target],
      status: "not_checked" as const,
      job_id: null,
      reason: "Manually entered section. Website coverage has not been checked.",
    }));
  const provenance = reviseProvenance({
    kind,
    entryId: entry.id,
    before: entry.content,
    after: content,
    provenance: stored,
    actorId,
    savedAt,
    requestId,
    note,
  });
  checkRoom(provenance);
  return {
    path: companyPath(companyId, `/entries/${entry.id}/revisions`),
    init: write("POST", {
      expectedRevision: entry.revision,
      content,
      provenance,
      reviewStatus: "unreviewed",
      reason: note,
      ...(restoreFrom ? { restoreFrom } : {}),
      requestId,
    }),
  };
}

/** Sends a prepared save. */
export const sendEntrySave = (save: PreparedSave) => api(save.path, save.init);
