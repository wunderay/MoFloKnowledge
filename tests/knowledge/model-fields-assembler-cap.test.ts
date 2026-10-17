// The assembler aggregates every approved entry's provenance. Each entry keeps the small per-entry coverage cap (500), but the
// aggregate is snapshot-sized: 32 singleton rows + 8 per person or offering + 1 for an empty collection, at most 4,033.
import { describe, expect, it } from "vitest";
import { EntryProvenanceSchema, KnowledgeBaseExportSchema, createEntryDefault, requiredCoverageTargets, createEmptyBusiness, type BusinessEntry } from "../../src/contracts";
import { assembleKnowledgeBase, type SnapshotEntry } from "../../src/knowledge/assemble";

const AUTHOR = "40000000-0000-4000-8000-000000000001";
const COMPANY = "10000000-0000-4000-8000-0000000000aa";
const PERSON_FIELDS = ["name", "title", "role", "gender", "background_or_relevance", "age", "nationality", "portrait"];
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** `people` approved key people, each with one name, one user-provided claim and one coverage row per registered field. */
function entries(people: number): SnapshotEntry[] {
  return Array.from({ length: people }, (_, n) => {
    const id = uuid("a8000000", n + 1);
    return {
      entry_id: id, kind: "key_person", revision: 1, review_status: "approved", author_id: AUTHOR, saved_at: "2026-10-16T04:59:00Z",
      created_at: `2026-10-16T04:00:00.${String(n).padStart(3, "0")}Z`,
      content: { ...(createEntryDefault("key_person", id) as object), name: `Person ${n + 1}` } as BusinessEntry,
      provenance: EntryProvenanceSchema.parse({
        sources: [], evidence: [], operations: [],
        claims: [{ id: uuid("a7000000", n + 1), entry_id: id, targets: [`/key_people/@${id}/name`], origin: "user_provided", evidence_ids: [], based_on_claim_ids: [], actor_id: AUTHOR, authored_at: "2026-10-16T04:58:00Z", note: "Entered by hand." }],
        coverage: PERSON_FIELDS.map((field) => ({ targets: [`/key_people/@${id}/${field}`], status: field === "name" ? "found" : "not_checked", job_id: null, reason: field === "name" ? null : "Entered manually." })),
      }),
    } as SnapshotEntry;
  });
}
const assemble = (rows: SnapshotEntry[]) =>
  assembleKnowledgeBase({ company: { id: COMPANY, name: "Maximal Co", website: "https://maximal.example/" }, snapshotId: "10000000-0000-4000-8000-0000000000ab", version: 1, savedAt: "2026-10-16T05:00:00Z", authorId: AUTHOR, entries: rows });

describe("assembleKnowledgeBase accepts snapshot-sized aggregates", () => {
  it.each([[59, 505], [500, 4033]])("%i people assemble into %i coverage rows that validate as a snapshot", (people, rows) => {
    const rowsIn = entries(people);
    expect(rowsIn.every((row) => row.provenance.coverage.length === 8)).toBe(true);
    const snapshot = assemble(rowsIn);
    expect(snapshot.provenance.coverage).toHaveLength(rows);
    expect(snapshot.provenance.claims).toHaveLength(people);
    expect(KnowledgeBaseExportSchema.safeParse(snapshot).success).toBe(true);
    // The same targets the SQL assembler emits: one row per required target, the entry's own assessment kept.
    const required = requiredCoverageTargets({ ...createEmptyBusiness(), key_people: snapshot.key_people });
    expect(snapshot.provenance.coverage.map((row) => row.targets[0])).toEqual(required);
    expect(snapshot.provenance.coverage.filter((row) => row.status === "found")).toHaveLength(people);
  }, 120_000);

  it("one person beyond the cap (501: 501 claims, 4,041 rows) is refused", () => {
    expect(() => assemble(entries(501))).toThrow();
  }, 120_000);

  it("a single entry keeps the per-entry coverage cap of 500", () => {
    const [row] = entries(1);
    expect(EntryProvenanceSchema.safeParse({ ...row.provenance, coverage: Array.from({ length: 501 }, () => row.provenance.coverage[0]) }).success).toBe(false);
  });
});
