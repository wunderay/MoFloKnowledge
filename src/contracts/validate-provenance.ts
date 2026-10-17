import type { EntryProvenance, ExportProvenance, Claim } from "./provenance";
import { parseBusinessEntry, type EntryKind } from "./business";
import { canonicalStringify } from "../knowledge/canonical-json";
import { AggregateProvenanceSchema, EntryProvenanceSchema, ExportProvenanceSchema } from "./provenance";
import {
  enumerateFactualLeaves,
  resolveStablePointer,
  assertUniqueBusinessIds,
  parseStablePointer,
} from "./stable-pointer";
import {
  requiredCoverageTargets,
  allowedOriginsForTarget,
  fieldForTarget,
} from "./field-registry";
export type ProvenanceIssue = { code: string; path: string; message: string };
export type CapturedSource = {
  id: string;
  url: string;
  retrieved_at: string;
  segments: { text: string }[];
  observations: {
    selector: string | null;
    property: string | null;
    value: string | null;
    asset_url: string | null;
  }[];
};
export type ProvenanceOptions = {
  entryIds?: string[];
  /** Authoritative immutable same-company claims used only to resolve cross-entry support. */
  supportingClaims?: Claim[];
  entryKinds?: Record<string, EntryKind>;
  historicalClaimIds?: string[];
  requireCoverage?: boolean;
  capturedSources?: CapturedSource[];
  approved?: boolean;
  /** The input aggregates a whole snapshot's entries, so it may hold up to the snapshot coverage cap. */
  aggregate?: boolean;
};
export function validateProvenance(
  business: Record<string, unknown>,
  input: EntryProvenance | ExportProvenance,
  options: ProvenanceOptions = {},
): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  const add = (code: string, path: string, message: string) =>
    issues.push({ code, path, message });
  const parsed = (
    "company" in input
      ? ExportProvenanceSchema
      : options.aggregate
        ? AggregateProvenanceSchema
        : EntryProvenanceSchema
  ).safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((x) => ({
      code: "schema",
      path: x.path.join("/"),
      message: x.message,
    }));
  const provenance = parsed.data;
  try {
    assertUniqueBusinessIds(business);
  } catch (e) {
    add("duplicate_id", "", (e as Error).message);
  }
  let leaves: ReturnType<typeof enumerateFactualLeaves>;
  try {
    leaves = enumerateFactualLeaves(business);
  } catch (e) {
    add("business_ids", "", (e as Error).message);
    return issues;
  }
  const claims = new Map(
    [...(options.supportingClaims ?? []), ...provenance.claims].map((c) => [
      c.id,
      c,
    ]),
  );
  const evidence = new Map(provenance.evidence.map((e) => [e.id, e]));
  const sources = new Map(provenance.sources.map((s) => [s.id, s]));
  const currentTargets = new Map<string, Claim[]>();
  const allIds = new Set<string>();
  for (const array of [
    provenance.claims,
    provenance.evidence,
    provenance.sources,
  ])
    for (const item of array) {
      if (allIds.has(item.id))
        add("duplicate_id", item.id, "Duplicate provenance UUID");
      allIds.add(item.id);
    }
  for (const item of provenance.evidence) {
    const source = sources.get(item.source_page_id);
    if (!source) {
      add("source_missing", item.id, "Evidence source does not resolve");
      continue;
    }
    if (options.capturedSources) {
      const capture = options.capturedSources.find((s) => s.id === source.id);
      if (
        !capture ||
        capture.url !== source.url ||
        capture.retrieved_at !== source.retrieved_at
      )
        add(
          "source_mismatch",
          item.id,
          "Source URL/retrieval metadata does not match stored capture",
        );
      else {
        if (
          item.excerpt &&
          !capture.segments.some((s) => s.text.includes(item.excerpt!))
        )
          add(
            "quote_mismatch",
            item.id,
            "Exact quote absent from captured segments",
          );
        if (
          item.technical &&
          !capture.observations.some((o) =>
            Object.keys(item.technical!).every(
              (k) =>
                o[k as keyof typeof o] === item.technical![k as keyof typeof o],
            ),
          )
        )
          add(
            "observation_mismatch",
            item.id,
            "Technical observation not captured",
          );
      }
    }
  }
  const entryIds =
    options.entryIds ??
    ("entries" in provenance
      ? provenance.entries.map((e) => e.entry_id)
      : undefined);
  const entryKinds =
    options.entryKinds ??
    ("entries" in provenance
      ? Object.fromEntries(provenance.entries.map((e) => [e.entry_id, e.kind]))
      : undefined);
  for (const claim of provenance.claims) {
    if (entryIds && !entryIds.includes(claim.entry_id))
      add("entry_missing", claim.id, "Claim entry is outside current manifest");
    if (new Set(claim.targets).size !== claim.targets.length)
      add("duplicate_target", claim.id, "Claim repeats target");
    if (claim.origin === "user_provided") {
      if (!claim.actor_id || !claim.authored_at || !claim.note)
        add(
          "user_attribution",
          claim.id,
          "User claim requires actor, time and correction note",
        );
    } else if (claim.evidence_ids.length === 0)
      add(
        "support_missing",
        claim.id,
        "Source, inferred and generated claims require evidence",
      );
    if (claim.origin === "generated" && claim.based_on_claim_ids.length === 0)
      add(
        "support_missing",
        claim.id,
        "Generated wording requires supporting fact claims",
      );
    for (const id of claim.evidence_ids)
      if (!evidence.has(id))
        add("evidence_missing", claim.id, "Claim evidence ID does not resolve");
    for (const id of claim.based_on_claim_ids)
      if (!claims.has(id))
        add(
          "claim_missing",
          claim.id,
          "Current supporting claim does not resolve",
        );
    for (const target of claim.targets) {
      const field = fieldForTarget(target);
      const repeatableId = /^\/(?:key_people|offerings)\/@([^/]+)\//.exec(
        target,
      )?.[1];
      if (
        (repeatableId && repeatableId !== claim.entry_id) ||
        (entryKinds && field && entryKinds[claim.entry_id] !== field.kind)
      )
        add("entry_target", target, "Claim targets a different entry");
      let value: unknown;
      try {
        value = resolveStablePointer(business, target);
      } catch {
        add("target_missing", target, "Claim points to missing/removed value");
        continue;
      }
      if (value !== null && typeof value === "object") {
        add("target_not_leaf", target, "Claims must target factual leaves");
        continue;
      }
      if (target.endsWith("/id")) {
        add(
          "target_metadata",
          target,
          "Item IDs are not factual claim targets",
        );
        continue;
      }
      const allowed = allowedOriginsForTarget(target);
      if (!allowed.includes(claim.origin))
        add(
          "origin_disallowed",
          target,
          "Origin is not allowed for this field",
        );
      const owners = currentTargets.get(target) ?? [];
      owners.push(claim);
      currentTargets.set(target, owners);
      if (/\/gender$/.test(target) && value !== null) {
        const original = claim.evidence_ids
          .map((id) => evidence.get(id)?.excerpt ?? "")
          .join(" ");
        const attested =
          claim.origin === "user_provided"
            ? /(?:self[- ]descri|self[- ]identif|explicit (?:public )?(?:gender|attestation))/i.test(
                claim.note ?? "",
              )
            : /(?:I (?:identify|describe myself) as|self[- ]descri|self[- ]identif|gender\s*:)/i.test(
                original,
              ) && original.includes(String(value));
        if (!attested)
          add(
            "gender_attestation",
            target,
            "Gender needs explicit self-description evidence or user attestation",
          );
      }
      if (
        target === "/positioning/founding_story" &&
        claim.origin === "source_backed"
      ) {
        const quotes = claim.evidence_ids.map(
          (id) => evidence.get(id)?.excerpt ?? "",
        );
        if (
          quotes.every((q) =>
            /^\s*(?:founded\s*(?:in\s*)?)?\d{4}[.!]?\s*$/i.test(q),
          )
        )
          add(
            "story_evidence",
            target,
            "Founding year alone is not an origin narrative",
          );
      }
      if (
        /\/suppliers_and_partners\/.+\/relationship_(?:type|text)$/.test(
          target,
        ) &&
        value !== null &&
        claim.origin !== "user_provided" &&
        claim.evidence_ids.every((id) => !evidence.get(id)?.excerpt)
      )
        add(
          "relationship_evidence",
          target,
          "Logo observation alone does not establish a relationship",
        );
    }
  }
  for (const leaf of leaves)
    if (!currentTargets.has(leaf.path))
      add(
        "leaf_unclaimed",
        leaf.path,
        "Populated business leaf lacks compatible claim",
      );
  for (const [target, owners] of currentTargets)
    if (owners.length > 1)
      add(
        "ambiguous_claim",
        target,
        "Multiple active claims for selected value",
      );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) {
      add("claim_cycle", id, "Claim support graph must be acyclic");
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of claims.get(id)?.based_on_claim_ids ?? [])
      if (claims.has(parent)) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const claim of provenance.claims) visit(claim.id);
  if (options.requireCoverage !== false) {
    const required = new Set(requiredCoverageTargets(business));
    const counts = new Map<string, number>();
    for (const assessment of provenance.coverage)
      for (const target of assessment.targets) {
        if (!required.has(target))
          add(
            "coverage_unknown",
            target,
            "Coverage target is not a required field",
          );
        counts.set(target, (counts.get(target) ?? 0) + 1);
        if (assessment.status !== "found" && !assessment.reason)
          add(
            "coverage_reason",
            target,
            "Missing/partial/conflict coverage requires explanation",
          );
      }
    for (const target of required)
      if (counts.get(target) !== 1)
        add(
          "coverage_count",
          target,
          "Required field needs exactly one coverage assessment",
        );
  }
  for (const operation of provenance.operations)
    if (
      operation.supersedes_claim_id &&
      options.historicalClaimIds &&
      !options.historicalClaimIds.includes(operation.supersedes_claim_id)
    )
      add(
        "historical_claim_missing",
        operation.supersedes_claim_id,
        "Superseded claim must belong to prior company revisions",
      );
  if ("conflicts" in provenance) {
    for (const conflict of provenance.conflicts) {
      try {
        resolveStablePointer(business, conflict.target);
      } catch {
        add(
          "conflict_target",
          conflict.target,
          "Conflict target does not resolve",
        );
      }
      for (const candidate of conflict.candidates) {
        const field = fieldForTarget(conflict.target);
        if (field) {
          try {
            const changed = structuredClone(business);
            const keys = parseStablePointer(conflict.target);
            const key = keys.at(-1)!;
            const parent = resolveStablePointer(
              changed,
              conflict.target.slice(0, conflict.target.lastIndexOf("/")),
            );
            if (!parent || typeof parent !== "object")
              throw new Error("Invalid parent");
            if (Array.isArray(parent)) {
              if (!/^(0|[1-9]\d*)$/.test(key))
                throw new Error("Expected metadata index");
              parent[Number(key)] = candidate.value;
            } else (parent as Record<string, unknown>)[key] = candidate.value;
            const root =
              field.kind === "key_person" || field.kind === "offering"
                ? conflict.target.split("/").slice(0, 3).join("/")
                : `/${field.kind}`;
            parseBusinessEntry(field.kind, resolveStablePointer(changed, root));
          } catch {
            add(
              "candidate_value",
              conflict.target,
              "Candidate value violates the business field schema",
            );
          }
        }

        if (
          !allowedOriginsForTarget(conflict.target).includes(candidate.origin)
        )
          add(
            "candidate_origin",
            conflict.target,
            "Candidate origin is disallowed",
          );
        if (
          candidate.origin !== "user_provided" &&
          candidate.evidence_ids.length === 0
        )
          add(
            "candidate_support",
            conflict.target,
            "Candidate requires captured evidence",
          );
        for (const id of candidate.evidence_ids)
          if (!evidence.has(id))
            add(
              "candidate_evidence",
              conflict.target,
              "Candidate evidence does not resolve",
            );
        for (const id of candidate.based_on_claim_ids)
          if (!claims.has(id))
            add(
              "candidate_claim",
              conflict.target,
              "Candidate supporting claim does not resolve",
            );
      }
      const decision = provenance.decisions.filter(
        (d) => d.conflict_id === conflict.id,
      );
      if (decision.length > 1)
        add(
          "conflict_decision",
          conflict.target,
          "Conflict has more than one decision",
        );
      if (options.approved && conflict.material && decision.length !== 1)
        add(
          "unresolved_conflict",
          conflict.target,
          "Material conflict blocks approval",
        );
      for (const d of decision) {
        if (
          d.target !== conflict.target ||
          (d.action === "select" &&
            !conflict.candidates.some((c) => c.id === d.candidate_id))
        )
          add(
            "conflict_decision",
            d.target,
            "Decision target/candidate does not match conflict",
          );
        if (d.action === "select") {
          const selected = conflict.candidates.find(
            (c) => c.id === d.candidate_id,
          );
          try {
            if (
              canonicalStringify(resolveStablePointer(business, d.target)) !==
              canonicalStringify(selected?.value)
            )
              add(
                "conflict_value",
                d.target,
                "Selected candidate does not match content",
              );
          } catch {
            add("conflict_value", d.target, "Selected target does not resolve");
          }
          if (selected) {
            const active = provenance.claims.filter((c) =>
              c.targets.some(
                (t) => t === d.target || t.startsWith(`${d.target}/`),
              ),
            );
            if (
              active.some(
                (c) =>
                  c.origin !== selected.origin ||
                  selected.evidence_ids.some(
                    (id) => !c.evidence_ids.includes(id),
                  ),
              )
            )
              add(
                "conflict_claim",
                d.target,
                "Selected value must retain its candidate origin/evidence",
              );
          }
        }
        if (d.action === "clear") {
          try {
            const value = resolveStablePointer(business, d.target);
            if (value !== null && !(Array.isArray(value) && value.length === 0))
              add(
                "conflict_value",
                d.target,
                "Cleared conflict must have empty value",
              );
          } catch {
            add("conflict_value", d.target, "Cleared target does not resolve");
          }
        }
      }
    }
    for (const d of provenance.decisions)
      if (!provenance.conflicts.some((c) => c.id === d.conflict_id))
        add(
          "conflict_missing",
          d.target,
          "Decision references unknown conflict",
        );
  }
  return issues;
}
export function assertValidProvenance(
  business: Record<string, unknown>,
  provenance: EntryProvenance | ExportProvenance,
  options: ProvenanceOptions = {},
): void {
  const issues = validateProvenance(business, provenance, options);
  if (issues.length)
    throw new Error(
      issues.map((i) => `${i.code} ${i.path}: ${i.message}`).join("; "),
    );
}
