import { describe, it, expect } from "vitest";
import fixture from "../contracts/illustrative-export.json";
import {
  createEntryDefault,
  createEmptyBusiness,
  EntryProvenanceSchema,
  type EntryKind,
  type BusinessEntry,
  type CandidateConflict,
  type ConflictDecision,
} from "../../src/contracts";
import {
  assembleKnowledgeBase,
  assemblePreview,
  previewPublication,
  type SnapshotEntry,
} from "../../src/knowledge/assemble";
import {
  canonicalStringify,
  canonicalHash,
} from "../../src/knowledge/canonical-json";
import { downloadFilename } from "../../src/knowledge/download-name";
import {
  reviseProvenance,
  reviseEntry,
} from "../../src/knowledge/revise-provenance";
import {
  formatAPACitations,
  attributionDetails,
} from "../../src/knowledge/apa";
import {
  filterView,
  resetScopedFilters,
} from "../../src/knowledge/filter-view";
import {
  applyConflictDecision,
  unresolvedConflicts,
} from "../../src/knowledge/conflict-decisions";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-10-16T04:59:00Z";
function entries(): SnapshotEntry[] {
  return fixture.provenance.entries.map((entry, index) => {
    const content =
      entry.kind === "key_person"
        ? fixture.key_people[0]
        : entry.kind === "offering"
          ? fixture.offerings[0]
          : fixture[entry.kind as keyof typeof fixture];
    const p = fixture.provenance;
    const root =
      entry.kind === "key_person"
        ? `/key_people/@${entry.entry_id}`
        : entry.kind === "offering"
          ? `/offerings/@${entry.entry_id}`
          : `/${entry.kind}`;
    return {
      ...entry,
      kind: entry.kind as EntryKind,
      review_status: "approved",
      created_at: `2026-10-16T04:0${index}:00Z`,
      content: structuredClone(content) as BusinessEntry,
      provenance: EntryProvenanceSchema.parse({
        sources: p.sources,
        evidence: p.evidence,
        claims: p.claims.filter((c) => c.entry_id === entry.entry_id),
        coverage: p.coverage.flatMap((c) => {
          const targets = c.targets.filter((t) => t.startsWith(`${root}/`));
          return targets.length ? [{ ...c, targets }] : [];
        }),
        operations: p.operations.filter((o) => o.entry_id === entry.entry_id),
      }),
    };
  });
}
const assemble = (rows = entries()) =>
  assembleKnowledgeBase({
    company: {
      id: fixture.company_id,
      name: "Lumen Ledger",
      website: "https://lumen-ledger.example/",
    },
    snapshotId: fixture.knowledge_base_version_id,
    version: 1,
    savedAt: time,
    authorId: fixture.provenance.company.snapshot_author_id,
    entries: rows,
  });
describe("immutable snapshot assembly", () => {
  it("assembles the complete example from current approved revisions and freezes copies", async () => {
    const rows = entries();
    const snapshot = assemble(rows);
    expect(snapshot.company_foundation).toEqual(fixture.company_foundation);
    expect(snapshot.provenance.claims).toHaveLength(
      fixture.provenance.claims.length,
    );
    const hash = await canonicalHash(snapshot);
    rows[0].content = createEntryDefault("company_foundation");
    expect(await canonicalHash(snapshot)).toBe(hash);
  });
  it("lists unresolved entries and requires an approval without fake preview metadata", () => {
    const rows = entries();
    rows[0].review_status = "unreviewed";
    expect(previewPublication(rows).canPublish).toBe(false);
    expect(() => assemble(rows)).toThrow("unreviewed");
    expect(assemblePreview(rows).payloadPreview).not.toHaveProperty(
      "knowledge_base_version_id",
    );
    expect(() => assemble([])).toThrow("At least one approved");
  });
  it("excludes rejected content/evidence and retains bounded rejection explanations", () => {
    const rows = entries();
    rows.find((e) => e.kind === "key_person")!.review_status = "rejected";
    const snapshot = assemble(rows);
    expect(snapshot.key_people).toEqual([]);
    expect(snapshot.provenance.evidence.some((e) => e.id.endsWith("007"))).toBe(
      false,
    );
    expect(
      snapshot.provenance.entries.some((e) => e.review_status === "rejected"),
    ).toBe(true);
    expect(
      snapshot.provenance.coverage.find((c) =>
        c.targets.includes("/key_people"),
      )?.reason,
    ).toContain("rejected");
  });
  it("uses stable creation order and duplicate singleton/entry guards", () => {
    const rows = entries();
    const person = structuredClone(rows.find((e) => e.kind === "key_person")!);
    person.entry_id = uuid(81);
    person.created_at = "2020-01-01T00:00:00Z";
    person.content = {
      ...person.content,
      id: person.entry_id,
    } as BusinessEntry;
    expect(
      assemblePreview([...rows, person]).payloadPreview.key_people[0].id,
    ).toBe(uuid(81));
    expect(() => assemblePreview([...rows, rows[0]])).toThrow(
      "Duplicate entry",
    );
  });
  it("defines canonical sorted-key bytes and safe download names", async () => {
    expect(canonicalStringify({ z: 1, a: { b: 2, a: "é" } })).toBe(
      '{"a":{"a":"é","b":2},"z":1}',
    );
    expect(await canonicalHash({ b: 2, a: 1 })).toBe(
      await canonicalHash({ a: 1, b: 2 }),
    );
    expect(() => canonicalStringify({ a: undefined })).toThrow();
    expect(downloadFilename('../../Über Acme\r\n"', 3)).toBe(
      "uber-acme-knowledge-base-v3.json",
    );
    expect(downloadFilename("公司", 1)).toBe("company-knowledge-base-v1.json");
  });
});
describe("revision transformation and conflicts", () => {
  it("keeps rejected candidate evidence internal while exporting a bounded choice", () => {
    const rows = entries();
    const foundation = rows[0];
    const existing = foundation.provenance.claims.find((c) =>
      c.targets.includes("/company_foundation/industry"),
    )!;
    const source = {
      ...foundation.provenance.sources[0],
      id: uuid(90),
      title: "Sensitive candidate source",
    };
    foundation.provenance.sources.push(source);
    foundation.provenance.evidence.push({
      id: uuid(91),
      source_page_id: source.id,
      kind: "text",
      excerpt: "Sensitive rejected candidate",
      technical: null,
    });
    foundation.provenance.conflicts.push({
      id: uuid(92),
      target: "/company_foundation/industry",
      material: true,
      candidates: [
        {
          id: uuid(93),
          value: fixture.company_foundation.industry,
          origin: "source_backed",
          evidence_ids: existing.evidence_ids,
          based_on_claim_ids: [],
        },
        {
          id: uuid(94),
          value: "Sensitive rejected candidate",
          origin: "source_backed",
          evidence_ids: [uuid(91)],
          based_on_claim_ids: [],
        },
      ],
    });
    foundation.provenance.decisions.push({
      id: uuid(95),
      conflict_id: uuid(92),
      target: "/company_foundation/industry",
      action: "select",
      candidate_id: uuid(93),
      actor_id: foundation.author_id,
      decided_at: time,
      note: "Selected the explicit industry statement.",
    });
    const snapshot = assemble(rows);
    expect(JSON.stringify(snapshot)).not.toContain(
      "Sensitive rejected candidate",
    );
    expect(snapshot.provenance.sources.some((s) => s.id === source.id)).toBe(
      false,
    );
    expect(
      snapshot.provenance.operations.some((o) => o.kind === "conflict_select"),
    ).toBe(true);
  });

  it("preserves generated origin on approval, and edits only changed leaves", () => {
    const rows = entries();
    const positioning = rows.find((e) => e.kind === "positioning")!;
    const approved = reviseEntry({
      kind: positioning.kind,
      entryId: positioning.entry_id,
      before: positioning.content,
      after: positioning.content,
      provenance: positioning.provenance,
      actorId: uuid(1),
      savedAt: time,
      requestId: uuid(2),
      note: "Approved suggestion",
      reviewStatus: "unreviewed",
      requestedReviewStatus: "approved",
    });
    expect(approved.provenance.claims[0].origin).toBe("generated");
    expect(approved.review_status).toBe("approved");
    const foundation = rows[0];
    const after = structuredClone(
      foundation.content,
    ) as typeof fixture.company_foundation;
    after.industry = "New industry";
    const changed = reviseEntry({
      kind: foundation.kind,
      entryId: foundation.entry_id,
      before: foundation.content,
      after,
      provenance: foundation.provenance,
      actorId: uuid(1),
      savedAt: time,
      requestId: uuid(2),
      note: "Corrected industry",
      reviewStatus: "approved",
    });
    expect(changed.review_status).toBe("unreviewed");
    expect(
      changed.provenance.claims.find((c) =>
        c.targets.includes("/company_foundation/overview"),
      )?.origin,
    ).toBe("source_backed");
    expect(
      changed.provenance.claims.find((c) =>
        c.targets.includes("/company_foundation/industry"),
      )?.origin,
    ).toBe("user_provided");
    expect(
      changed.provenance.operations.some((o) => o.supersedes_claim_id),
    ).toBe(true);
  });
  it("clears values with a historical operation and removes deleted stable-ID targets", () => {
    const row = entries().find((e) => e.kind === "market_and_customers")!;
    const after = structuredClone(
      row.content,
    ) as typeof fixture.market_and_customers;
    after.ctas = [];
    const p = reviseProvenance({
      kind: row.kind,
      entryId: row.entry_id,
      before: row.content,
      after,
      provenance: row.provenance,
      actorId: uuid(1),
      savedAt: time,
      requestId: uuid(2),
      note: "Removed CTA",
    });
    expect(
      p.claims.some((c) => c.targets.some((t) => t.includes("/ctas/"))),
    ).toBe(false);
    expect(p.operations.some((o) => o.kind === "user_correction")).toBe(true);
    expect(
      row.provenance.claims.some((c) =>
        c.targets.some((t) => t.includes("/ctas/")),
      ),
    ).toBe(true);
  });
  it("records bounded candidate decisions without mutating original candidates", () => {
    const conflict: CandidateConflict = {
      id: uuid(1),
      target: "/positioning/company_pitch",
      material: true,
      candidates: [
        {
          id: uuid(2),
          value: "First pitch",
          origin: "source_backed",
          evidence_ids: [uuid(4)],
          based_on_claim_ids: [],
        },
        {
          id: uuid(3),
          value: "Other pitch",
          origin: "source_backed",
          evidence_ids: [uuid(4)],
          based_on_claim_ids: [],
        },
      ],
    };
    const d: ConflictDecision = {
      id: uuid(5),
      conflict_id: conflict.id,
      target: conflict.target,
      action: "select",
      candidate_id: uuid(3),
      actor_id: uuid(6),
      decided_at: time,
      note: "Selected explicit statement",
    };
    const original = createEmptyBusiness();
    const result = applyConflictDecision(original, conflict, d);
    expect(result.business.positioning.company_pitch).toBe("Other pitch");
    expect(original.positioning.company_pitch).toBe(null);
    expect(unresolvedConflicts([conflict], [])).toHaveLength(1);
    expect(unresolvedConflicts([conflict], [d])).toHaveLength(0);
    expect(() =>
      applyConflictDecision(original, conflict, {
        ...d,
        candidate_id: uuid(90),
      }),
    ).toThrow("unknown");
  });
});
describe("APA references and company view", () => {
  it("assigns stable same-author/year letters without treating retrieval as publication", () => {
    const first = formatAPACitations(fixture.provenance.sources);
    const reverse = formatAPACitations(
      [...fixture.provenance.sources].reverse(),
    );
    expect([...first.entries()].sort()).toEqual([...reverse.entries()].sort());
    expect(first.get(fixture.provenance.sources[0].id)?.citation).toBe(
      "(Lumen Ledger, n.d.-a)",
    );
    expect(
      first.get(fixture.provenance.sources[0].id)?.reference,
    ).not.toContain("2026");
    const dynamic = formatAPACitations([fixture.provenance.sources[0]], {
      changeableSourceIds: [fixture.provenance.sources[0].id],
    });
    expect(dynamic.get(fixture.provenance.sources[0].id)?.reference).toContain(
      "Retrieved October 16, 2026, from",
    );
  });
  it("uses title fallback and explicit nonquote/user/unknown attribution", () => {
    const source = {
      ...fixture.provenance.sources[0],
      author: null,
      published_on: "2020-01-02",
    };
    expect(formatAPACitations([source]).get(source.id)?.citation).toBe(
      "(Lumen Ledger, 2020)",
    );
    const generated = fixture.provenance.claims.find(
      (c) => c.origin === "generated",
    )!;
    expect(
      attributionDetails(generated as never, undefined, true).note,
    ).toContain("not a source quote");
    expect(attributionDetails(undefined).evidenceIds).toEqual([]);
    expect(
      attributionDetails(
        fixture.provenance.claims.find(
          (c) => c.origin === "user_provided",
        ) as never,
      ).label,
    ).toBe("User-provided correction");
  });
  it("composes filters on one company without searching source excerpts or IDs", () => {
    const rows = entries().map((e) => ({
      ...e,
      company_id: fixture.company_id,
    }));
    const foreign = { ...rows[0], company_id: uuid(99) };
    expect(
      filterView([...rows, foreign], {
        companyId: fixture.company_id,
        query: fixture.positioning.company_pitch!,
        origin: "generated",
        section: "positioning",
      }),
    ).toHaveLength(1);
    expect(
      filterView(rows, {
        companyId: fixture.company_id,
        query: rows[0].entry_id,
      }),
    ).toEqual([]);
    expect(resetScopedFilters(uuid(98))).toEqual({ companyId: uuid(98) });
  });
});
