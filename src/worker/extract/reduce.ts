import {
  createEntryDefault,
  createEmptyProvenance,
  entryBusiness,
  enumerateFactualLeaves,
  FIELD_REGISTRY,
  parseBusinessEntry,
  ProposalSchema,
  validateProvenance,
  type Proposal,
  type EntryKind,
  type Claim,
} from "../../contracts";
import { canonicalStringify } from "../../knowledge/canonical-json";
import { stableId } from "./identity";
import type { ValidatedCandidate } from "./validate-candidates";
import { SUPPORTED_FIELDS } from "./deterministic";
export function reduceCandidates(
  candidates: ValidatedCandidate[],
  options: {
    companyId: string;
    jobId: string;
    partial: boolean;
  },
): Proposal[] {
  if (candidates.some((candidate) => candidate.origin !== "source_backed"))
    throw new Error("invalid_origin");
  candidates = [...candidates].sort(
    (a, b) =>
      a.entryId.localeCompare(b.entryId) ||
      a.field.localeCompare(b.field) ||
      a.id.localeCompare(b.id),
  );
  const groups = new Map<
    string,
    { kind: EntryKind; candidates: ValidatedCandidate[] }
  >();
  for (const kind of [
    "company_foundation",
    "positioning",
    "market_and_customers",
    "branding_and_style",
    "online_presence",
  ] as const)
    groups.set(stableId(options.companyId, kind, "singleton"), {
      kind,
      candidates: [],
    });
  for (const c of candidates) {
    const group = groups.get(c.entryId) ?? { kind: c.kind, candidates: [] };
    group.candidates.push(c);
    groups.set(c.entryId, group);
  }
  const proposals: Proposal[] = [];
  for (const [entryId, group] of groups) {
    const content = createEntryDefault(
      group.kind,
      entryId,
    ) as unknown as Record<string, unknown>;
    const provenance = createEmptyProvenance();
    const sourceMap = new Map<string, (typeof provenance.sources)[number]>();
    const evidenceMap = new Map<string, (typeof provenance.evidence)[number]>();
    for (const field of FIELD_REGISTRY.filter((f) => f.kind === group.kind)) {
      const all = group.candidates.filter((c) => c.field === field.path);
      const unique = new Map<string, ValidatedCandidate>();
      for (const c of all) {
        const key = canonicalStringify(c.value) + "|" + c.origin;
        const old = unique.get(key);
        if (old) {
          old.evidenceIds = [
            ...new Set([...old.evidenceIds, ...c.evidenceIds]),
          ];
        } else unique.set(key, { ...c, evidenceIds: [...c.evidenceIds] });
      }
      const values = [...unique.values()];
      const target = field.path.replace("@id", `@${entryId}`);
      const collection = Array.isArray(content[field.field]);
      const itemValues = new Map<string, string>();
      let collectionConflict = false;
      if (collection)
        for (const c of values)
          for (const item of c.value as { id: string }[]) {
            const previous = itemValues.get(item.id),
              next = canonicalStringify(item);
            if (previous && previous !== next) collectionConflict = true;
            itemValues.set(item.id, next);
          }
      const conflict = collection ? collectionConflict : values.length > 1;
      if (conflict) {
        provenance.conflicts.push({
          id: stableId(options.jobId, entryId, target, "conflict"),
          target,
          material: true,
          candidates: values.map((c) => ({
            id: c.id,
            value: c.value as never,
            origin: c.origin,
            evidence_ids: c.evidenceIds,
            based_on_claim_ids: [],
          })),
        });
      } else if (values.length) {
        content[field.field] = collection
          ? [
              ...new Map(
                values.flatMap((c) =>
                  (c.value as { id: string }[]).map((v) => [v.id, v] as const),
                ),
              ).values(),
            ].sort((a, b) => a.id.localeCompare(b.id))
          : values[0].value;
      }
      provenance.coverage.push({
        targets: [target],
        status: conflict
          ? "conflict"
          : values.length
            ? "found"
            : !SUPPORTED_FIELDS.includes(field.path)
              ? "not_checked"
              : options.partial
                ? "partial"
                : "not_found",
        job_id: options.jobId,
        reason: conflict
          ? "Differing supported candidates need a reviewer decision."
          : values.length
            ? null
            : !SUPPORTED_FIELDS.includes(field.path)
              ? "No deterministic rule assesses this field; enter or review it manually."
              : options.partial
                ? "Relevant capture, rendering or extraction was unavailable, failed, truncated or bounded."
                : "No explicit value matched the supported rules in the successfully processed bounded pages.",
      });
      for (const c of all) {
        const page = c.page;
        sourceMap.set(page.id, {
          id: page.id,
          url: page.capture.finalUrl,
          title: page.capture.title,
          author: page.capture.author,
          site_name: page.capture.publisher,
          published_on: page.capture.publishedAt?.slice(0, 10) ?? null,
          retrieved_at: page.retrievedAt,
        });
        for (const id of c.segment_ids) {
          const segment = page.capture.segments.find((s) => s.id === id)!;
          const eid = stableId(page.id, "segment", id);
          evidenceMap.set(eid, {
            id: eid,
            source_page_id: page.id,
            kind: "text",
            excerpt: segment.text,
            technical: null,
          });
        }
        for (const o of c.observations) {
          const eid = stableId(page.id, "observation", o.id);
          evidenceMap.set(eid, {
            id: eid,
            source_page_id: page.id,
            kind: "technical",
            excerpt: null,
            technical: {
              selector: o.selector,
              property: o.property,
              value: o.value,
              asset_url: o.asset_url,
            },
          });
        }
      }
      if (conflict) continue;
      const leaves = enumerateFactualLeaves(
        entryBusiness(group.kind, content as never),
      ).filter((l) => l.path === target || l.path.startsWith(target + "/"));
      for (const leaf of leaves) {
        const matching = values.filter((c) => {
          if (!collection) return true;
          const item = c.value as { id: string }[];
          return item.some((v) => leaf.path.includes("/@" + v.id + "/"));
        });
        if (!matching.length) continue;
        const c = matching[0];
        const claim: Claim = {
          id: stableId(options.jobId, entryId, leaf.path, "claim"),
          entry_id: entryId,
          targets: [leaf.path],
          origin: c.origin,
          evidence_ids: [...new Set(matching.flatMap((c) => c.evidenceIds))],
          based_on_claim_ids: [],
          actor_id: null,
          authored_at: null,
          note: c.note,
        };
        provenance.claims.push(claim);
      }
    }
    provenance.sources = [...sourceMap.values()];
    provenance.evidence = [...evidenceMap.values()];
    // Empty repeatable entities are never emitted.
    if (
      (group.kind === "key_person" || group.kind === "offering") &&
      !enumerateFactualLeaves(entryBusiness(group.kind, content as never))
        .length
    )
      continue;
    const parsed = parseBusinessEntry(group.kind, content);

    proposals.push(
      ProposalSchema.parse({
        id: stableId(options.jobId, entryId, "proposal"),
        kind: group.kind,
        target_entry_id: null,
        base_revision: null,
        schema_version: "1.0.0",
        content: parsed,
        provenance,
        conflicts: provenance.conflicts,
        changes: FIELD_REGISTRY.filter((field) => field.kind === group.kind)
          .map((field) => field.path.replace("@id", `@${entryId}`))
          .filter(
            (target) =>
              !provenance.conflicts.some(
                (conflict) => conflict.target === target,
              ) &&
              provenance.claims.some((claim) =>
                claim.targets.some(
                  (path) => path === target || path.startsWith(target + "/"),
                ),
              ),
          )
          .map((target) => ({
            id: stableId(options.jobId, entryId, target, "change"),
            target,
          })),
      }),
    );
  }

  const allClaims = proposals.flatMap((p) => p.provenance.claims);
  for (const proposal of proposals) {
    const entryId =
      proposal.provenance.claims[0]?.entry_id ??
      ("id" in proposal.content
        ? proposal.content.id
        : stableId(options.companyId, proposal.kind, "singleton"));
    const issues = validateProvenance(
      entryBusiness(proposal.kind, proposal.content),
      proposal.provenance,
      { entryIds: [entryId], supportingClaims: allClaims },
    );
    if (issues.length)
      throw new Error(
        "Reduced provenance invalid: " +
          issues.map((i) => i.code + " " + i.path).join(","),
      );
  }
  return proposals;
}
