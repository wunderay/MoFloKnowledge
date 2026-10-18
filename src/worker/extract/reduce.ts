import {
  createEntryDefault,
  createEmptyProvenance,
  entryBusiness,
  enumerateFactualLeaves,
  FIELD_REGISTRY,
  parseBusinessEntry,
  ProposalSchema,
  validateProvenance,
  resolveStablePointer,
  type Proposal,
  type EntryKind,
  type Claim,
} from "../../contracts";
import { canonicalStringify } from "../../knowledge/canonical-json";
import { stableId } from "./identity";
import type { ValidatedCandidate } from "./validate-candidates";
import { SUPPORTED_FIELDS } from "./deterministic";
import { buyerIdentityKey } from "./market-text";
import { FOUNDER_STATEMENT_NOTE } from "./text";
// Narrative wording differs naturally across pages; factual scalar values still conflict.
const narrativeFields = new Set([
  "overview", "industry", "business_model", "company_pitch", "founding_story",
  "name", "title", "role", "background_or_relevance", "description", "category",
]);
const normalizedWording = (value: unknown) => typeof value === "string"
  ? value.normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  : canonicalStringify(value);
function equivalentItem(value: unknown): unknown {
  if (typeof value === "string") {
    return /^https?:/.test(value) ? value : normalizedWording(value);
  }
  if (Array.isArray(value)) {
    return value.map(equivalentItem);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, equivalentItem(v)]));
  }
  return value;
}
const pageChrome = /^(?:skip(?: to)?\b.*|(?:toggle|open|close) (?:the )?(?:main )?(?:navigation|menu)|main (?:navigation|menu))$/i;
const categoricalFields = new Set(["name", "title", "role", "category", "industry"]);
const sourceQuality = (c: ValidatedCandidate) => c.segment_ids.length ? 2 :
  c.observations.some((o) => o.property?.startsWith("jsonld:")) ? 1 : 0;
function rankCandidates(a: ValidatedCandidate, b: ValidatedCandidate): number {
  return (b.priority ?? 0) - (a.priority ?? 0) || sourceQuality(b) - sourceQuality(a) ||
    String(b.value).length - String(a.value).length || a.id.localeCompare(b.id);
}
function mergeFontItems(items: { id: string }[]): { id: string }[] {
  const merged = new Map<string, { id: string }>();
  for (const item of items) {
    const previous = merged.get(item.id);
    if (previous && "family" in item && "family" in previous) {
      const oldFont = previous as typeof previous & { observations: string[] };
      const font = item as typeof item & { observations: string[] };
      merged.set(item.id, { ...previous,
        observations: [...new Set([...oldFont.observations, ...font.observations])].sort(),
      } as typeof previous);
    } else if (!previous) {
      merged.set(item.id, item);
    }
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export function reduceCandidates(
  candidates: ValidatedCandidate[],
  options: {
    companyId: string;
    jobId: string;
    partial: boolean;
  },
): Proposal[] {
  if (candidates.some((candidate) => candidate.origin !== "source_backed")) {
    throw new Error("invalid_origin");
  }
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
  ] as const) {
    groups.set(stableId(options.companyId, kind, "singleton"), {
      kind,
      candidates: [],
    });
  }
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
      let all = group.candidates.filter((c) => c.field === field.path).sort(rankCandidates);
      if (field.path === "/offerings/@id/name") {
        // A name is its first line; trailing description lines are not part of it, and page chrome is never a name.
        all = all.map((c) => typeof c.value === "string" ? { ...c, value: c.value.split("\n")[0].trim() } : c)
          .filter((c) => !pageChrome.test(String(c.value)));
      }
      if (field.path === "/company_foundation/year_founded" && all.some((c) => c.note !== FOUNDER_STATEMENT_NOTE)) {
        // An explicit company founding statement always wins over a founder's own history.
        all = all.filter((c) => c.note !== FOUNDER_STATEMENT_NOTE);
      }
      const collection = Array.isArray(content[field.field]);
      const unique = new Map<string, ValidatedCandidate>();
      for (const c of all) {
        const key = (narrativeFields.has(field.field) && !collection
          ? normalizedWording(c.value) : canonicalStringify(c.value)) + "|" + c.origin;
        const old = unique.get(key);
        if (old) {
          old.evidenceIds = [
            ...new Set([...old.evidenceIds, ...c.evidenceIds]),
          ];
        } else {
          unique.set(key, { ...c, evidenceIds: [...c.evidenceIds] });
        }
      }
      let values = [...unique.values()];
      if (field.path === "/company_foundation/main_address") {
        // An address whose parts all appear in another, fuller address is the same place, not a conflict.
        const parts = (v: unknown) => Object.entries(v as Record<string, unknown>)
          .filter(([key, part]) => key !== "id" && key !== "label" && typeof part === "string" && part).map(([, part]) => normalizedWording(part));
        const text = (v: unknown) => " " + parts(v).join(" ") + " ";
        values = values.filter((a) => !values.some((b) => b !== a &&
          parts(a.value).every((part) => text(b.value).includes(" " + part + " ")) &&
          parts(b.value).join(" ").length > parts(a.value).join(" ").length));
      }
      let assembledSources: ValidatedCandidate[] | null = null;
      if (!collection && narrativeFields.has(field.field) && values.length) {
        // Labels can disagree factually even at equal quality. Only lower-quality
        // labels are superseded; free prose can select one exact best passage.
        const best = values[0];
        values = categoricalFields.has(field.field)
          ? values.filter((c) => (c.priority ?? 0) === (best.priority ?? 0) && sourceQuality(c) === sourceQuality(best))
          : values.slice(0, 1);
      }
      if (group.kind === "company_foundation" && field.field === "overview" && all.length && (all[0].priority ?? 0) < 99) {
        // Keep the strongest visible company description and its published homepage
        // summary together. Each passage retains its own validated source evidence.
        const key = (value: unknown) => String(value).replace(/\s+/g, " ").trim().toLowerCase();
        assembledSources = [all[0]];
        const seen = new Set([key(all[0].value)]);
        for (const c of all) {
          if (assembledSources.length >= 3 || typeof c.value !== "string" ||
            new URL(c.page.capture.finalUrl).pathname !== "/" || seen.has(key(c.value))) {
            continue;
          }
          const publishedSummary = c.observations.some((o) =>
            (o.property === "meta-description" || /^jsonld:.*\/description$/.test(o.property ?? "")) &&
            o.value !== null && key(o.value) === key(c.value));
          if (!publishedSummary || [...assembledSources, c].map((v) => String(v.value)).join("\n\n").length > 20000) {
            continue;
          }
          assembledSources.push(c);
          seen.add(key(c.value));
        }
        values = [{ ...all[0], value: assembledSources.map((c) => c.value).join("\n\n"),
          evidenceIds: [...new Set(assembledSources.flatMap((c) => c.evidenceIds))] }];
      }
      if (group.kind === "key_person" && field.field === "background_or_relevance" && values.length) {
        const best = values[0];
        assembledSources = [best];
        const parts = String(best.value).split(/\n\s*\n/);
        const seen = new Set(parts.map(normalizedWording));
        for (const candidate of all) {
          if (candidate.note !== "Additional explicitly named founder background.") {
            continue;
          }
          const additions = String(candidate.value).split(/\n\s*\n/).filter((part) => !seen.has(normalizedWording(part)));
          if (!additions.length) {
            continue;
          }
          parts.push(...additions);
          additions.forEach((part) => seen.add(normalizedWording(part)));
          assembledSources.push(candidate);
        }
        values = [{ ...best, value: parts.join("\n\n"), evidenceIds: [...new Set(assembledSources.flatMap((candidate) => candidate.evidenceIds))] }];
      }
      const target = field.path.replace("@id", `@${entryId}`);
      const itemValues = new Map<string, string>();
      let collectionConflict = false;
      if (collection) {
        for (const c of values) {
          for (const item of c.value as { id: string }[]) {
            const previous = itemValues.get(item.id),
              next = canonicalStringify(field.field === "target_buyers"
                ? { ...item, text: buyerIdentityKey((item as { id: string; text: string }).text) }
                : field.field === "channels" ? equivalentItem({ ...item, label: null }) : equivalentItem(item));
            if (previous && previous !== next && field.field !== "fonts") {
              collectionConflict = true;
            }
            itemValues.set(item.id, next);
          }
        }
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
          ? mergeFontItems(values.flatMap((c) => c.value as { id: string }[]))
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
      for (const c of assembledSources ?? all) {
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- segment ids of an accepted candidate were validated against this page
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
      if (conflict) {
        continue;
      }
      const leaves = enumerateFactualLeaves(
        entryBusiness(group.kind, content as never),
      ).filter((l) => l.path === target || l.path.startsWith(target + "/"));
      for (const leaf of leaves) {
        const matching = values.filter((c) => {
          if (!collection) {
            return true;
          }
          // Attach only evidence that actually supports this selected leaf.
          try {
            if (field.field === "fonts" && /\/observations\/\d+$/.test(leaf.path)) {
              const itemId = leaf.path.slice(target.length).split("/")[1]?.slice(1);
              const font = (c.value as { id: string; observations: string[] }[]).find((v) => v.id === itemId);
              return font?.observations.includes(String(leaf.value)) ?? false;
            }
            const observed = resolveStablePointer(c.value, leaf.path.slice(target.length));
            if (field.field === "target_buyers" && leaf.path.endsWith("/text")) {
              return buyerIdentityKey(String(observed)) === buyerIdentityKey(String(leaf.value));
            }
            return observed === leaf.value;
          } catch { return false; }
        });
        if (!matching.length) {
          continue;
        }
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
    ) {
      continue;
    }
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
    if (issues.length) {
      throw new Error(
        "Reduced provenance invalid: " +
          issues.map((i) => i.code + " " + i.path).join(","),
      );
    }
  }
  return proposals;
}
