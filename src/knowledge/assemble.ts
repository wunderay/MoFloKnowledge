import { createEmptyBusiness } from "../contracts/defaults";
import {
  parseBusinessEntry,
  entryRoot,
  type Business,
  type BusinessEntry,
  type EntryKind,
} from "../contracts/business";
import {
  KnowledgeBaseExportSchema,
  type KnowledgeBaseExport,
} from "../contracts/knowledge-base";
import type {
  EntryProvenance,
  ReviewStatus,
  Source,
  Evidence,
  Claim,
  CoverageAssessment,
} from "../contracts/provenance";
import { requiredCoverageTargets } from "../contracts/field-registry";
import { resolveStablePointer } from "../contracts/stable-pointer";
import { assertValidProvenance } from "../contracts/validate-provenance";
export type SnapshotEntry = {
  entry_id: string;
  kind: EntryKind;
  revision: number;
  review_status: ReviewStatus;
  author_id: string;
  saved_at: string;
  created_at: string;
  content: BusinessEntry;
  provenance: EntryProvenance;
};
export type BlockingEntry = { entry_id: string; reason: string };
export function previewPublication(entries: SnapshotEntry[]): {
  blockingEntries: BlockingEntry[];
  approvedCount: number;
  canPublish: boolean;
} {
  const blockingEntries: BlockingEntry[] = [];
  for (const entry of entries) {
    if (entry.review_status === "unreviewed")
      blockingEntries.push({
        entry_id: entry.entry_id,
        reason: "Entry is unreviewed",
      });
    else if (
      entry.review_status === "approved" &&
      (entry.provenance.conflicts ?? []).some(
        (c) =>
          c.material &&
          !(entry.provenance.decisions ?? []).some(
            (d) => d.conflict_id === c.id,
          ),
      )
    )
      blockingEntries.push({
        entry_id: entry.entry_id,
        reason: "Material conflict is unresolved",
      });
  }
  const approvedEntries = entries.filter((e) => e.review_status === "approved");
  const currentClaimIds = new Set(
    approvedEntries.flatMap((e) => e.provenance.claims.map((c) => c.id)),
  );
  for (const entry of approvedEntries) {
    if (
      entry.provenance.claims.some((c) =>
        c.based_on_claim_ids.some((id) => !currentClaimIds.has(id)),
      )
    )
      blockingEntries.push({
        entry_id: entry.entry_id,
        reason: "Supporting fact is not present in approved current revisions.",
      });
  }
  const approvedCount = entries.filter(
    (e) => e.review_status === "approved",
  ).length;
  return {
    blockingEntries,
    approvedCount,
    canPublish: approvedCount > 0 && blockingEntries.length === 0,
  };
}
function approvedBusiness(entries: SnapshotEntry[]): Business {
  const business = createEmptyBusiness();
  const singletons = new Set<string>(),
    ids = new Set<string>();
  for (const entry of [...entries].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.entry_id.localeCompare(b.entry_id),
  )) {
    if (ids.has(entry.entry_id)) throw new Error("Duplicate entry UUID");
    ids.add(entry.entry_id);
    if (entry.review_status !== "approved") continue;
    const content = parseBusinessEntry(entry.kind, entry.content);
    if (entry.kind === "key_person") {
      if (!("id" in content) || content.id !== entry.entry_id)
        throw new Error("Person ID must match entry ID");
      business.key_people.push(content as Business["key_people"][number]);
    } else if (entry.kind === "offering") {
      if (!("id" in content) || content.id !== entry.entry_id)
        throw new Error("Offering ID must match entry ID");
      business.offerings.push(content as Business["offerings"][number]);
    } else {
      if (singletons.has(entry.kind)) throw new Error("Duplicate singleton");
      singletons.add(entry.kind);
      Object.assign(business, { [entry.kind]: content });
    }
  }
  return business;
}
export function assemblePreview(entries: SnapshotEntry[]): {
  payloadPreview: Business;
  blockingEntries: BlockingEntry[];
  approvedCount: number;
} {
  const { blockingEntries, approvedCount } = previewPublication(entries);
  return {
    payloadPreview: approvedBusiness(entries),
    blockingEntries,
    approvedCount,
  };
}
export type AssembleInput = {
  company: { id: string; name: string; website: string };
  snapshotId: string;
  version: number;
  savedAt: string;
  authorId: string;
  entries: SnapshotEntry[];
  historicalClaimIds?: string[];
};
function unique<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const prior = byId.get(item.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item))
      throw new Error("Conflicting provenance UUID");
    byId.set(item.id, item);
  }
  return [...byId.values()];
}
export function assembleKnowledgeBase(
  input: AssembleInput,
): KnowledgeBaseExport {
  const readiness = previewPublication(input.entries);
  if (!readiness.canPublish)
    throw new Error(
      readiness.approvedCount === 0
        ? "At least one approved entry is required"
        : readiness.blockingEntries
            .map((e) => `${e.entry_id}: ${e.reason}`)
            .join("; "),
    );
  const business = approvedBusiness(input.entries);
  const orderedEntries = [...input.entries].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.entry_id.localeCompare(b.entry_id),
  );
  const approved = orderedEntries.filter((e) => e.review_status === "approved");
  const allClaims = unique(approved.flatMap((e) => e.provenance.claims));
  const claimsById = new Map(allClaims.map((c) => [c.id, c]));
  const selected = new Set<string>();
  function include(id: string): void {
    if (selected.has(id)) return;
    const claim = claimsById.get(id);
    if (!claim)
      throw new Error("Supporting claim is absent from approved entries");
    selected.add(id);
    for (const parent of claim.based_on_claim_ids) include(parent);
  }
  for (const entry of approved) {
    const root = entryRoot(entry.kind, entry.entry_id);
    for (const claim of entry.provenance.claims)
      if (claim.targets.some((t) => t.startsWith(`${root}/`)))
        include(claim.id);
  }
  const claims: Claim[] = allClaims.filter((c) => selected.has(c.id));
  const evidenceIds = new Set(claims.flatMap((c) => c.evidence_ids));
  const evidence: Evidence[] = unique(
    approved.flatMap((e) => e.provenance.evidence),
  ).filter((e) => evidenceIds.has(e.id));
  const sourceIds = new Set(evidence.map((e) => e.source_page_id));
  const sources: Source[] = unique(
    approved.flatMap((e) => e.provenance.sources),
  ).filter((s) => sourceIds.has(s.id));
  const required = requiredCoverageTargets(business);
  const coverage: CoverageAssessment[] = [];
  for (const target of required) {
    const assessments = approved.flatMap((e) =>
      e.provenance.coverage.flatMap((c) =>
        c.targets.includes(target) ? [{ ...c, targets: [target] }] : [],
      ),
    );
    if (assessments.length > 1)
      throw new Error(`Duplicate coverage: ${target}`);
    if (assessments.length) coverage.push(assessments[0]);
    else {
      const section = target.split("/")[1];
      const rejected = input.entries.some(
        (e) =>
          e.review_status === "rejected" &&
          entryRoot(e.kind, e.entry_id).split("/")[1] === section,
      );
      coverage.push({
        targets: [target],
        status: "not_checked",
        job_id: null,
        reason: rejected
          ? "Entry rejected and excluded by reviewer."
          : "No approved entry assessed this field.",
      });
    }
  }
  const payload = KnowledgeBaseExportSchema.parse({
    ...business,
    schema_version: "1.0.0",
    company_id: input.company.id,
    knowledge_base_version_id: input.snapshotId,
    version: input.version,
    saved_at: input.savedAt,
    provenance: {
      company: {
        name: input.company.name,
        website: input.company.website,
        snapshot_author_id: input.authorId,
      },
      entries: orderedEntries.map((e) => ({
        entry_id: e.entry_id,
        kind: e.kind,
        revision: e.revision,
        review_status: e.review_status,
        author_id: e.author_id,
        saved_at: e.saved_at,
      })),
      sources,
      evidence,
      claims,
      coverage,
      operations: approved
        .flatMap((e) => e.provenance.operations)
        .concat(
          approved.flatMap((e) =>
            (e.provenance.decisions ?? []).map((d) => ({
              request_id: d.id,
              entry_id: e.entry_id,
              kind: `conflict_${d.action}`,
              supersedes_claim_id: null,
              note: `Target ${d.target}; conflict ${d.conflict_id}; selected candidate ${d.candidate_id ?? "none"}; reviewer ${d.actor_id}; decided ${d.decided_at}. ${d.note}`,
            })),
          ),
        )
        .filter((o) => o.kind !== "rejected_candidate")
        .map((o) => ({ ...o, note: o.note?.slice(0, 2000) ?? null })),
    },
  });
  assertValidProvenance(business, payload.provenance, {
    entryIds: approved.map((e) => e.entry_id),
    historicalClaimIds: input.historicalClaimIds,
  });
  // Check decisions against internal candidates before discarding sensitive candidates from export.
  assertValidProvenance(
    business,
    {
      sources: unique(approved.flatMap((e) => e.provenance.sources)),
      evidence: unique(approved.flatMap((e) => e.provenance.evidence)),
      claims,
      coverage,
      operations: payload.provenance.operations,
      conflicts: approved.flatMap((e) => e.provenance.conflicts ?? []),
      decisions: approved.flatMap((e) => e.provenance.decisions ?? []),
    },
    {
      entryIds: approved.map((e) => e.entry_id),
      approved: true,
      historicalClaimIds: input.historicalClaimIds,
    },
  );
  for (const claim of claims)
    for (const target of claim.targets) resolveStablePointer(business, target);
  return payload;
}
