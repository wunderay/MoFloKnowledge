import { expect, it } from "vitest";
import { filterView, type ViewEntry } from "../../src/knowledge/filter-view";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = uuid(1);
const personA = uuid(10);
const personB = uuid(11);
const claim = (id: number, entry: string, origin: string, target: string) => ({
  id: uuid(id), entry_id: entry, targets: [target], origin,
  evidence_ids: [uuid(500)], based_on_claim_ids: [], actor_id: null, authored_at: null, note: null,
});
// Both entries carry the SAME aggregate provenance (as a snapshot does), sharing one evidence row.
const shared = {
  sources: [], evidence: [], operations: [], conflicts: [], decisions: [],
  claims: [
    claim(20, personA, "generated", `/key_people/@${personA}/name`),
    claim(21, personB, "user_provided", `/key_people/@${personB}/name`),
  ],
  coverage: [
    { targets: [`/key_people/@${personA}/name`], status: "partial", job_id: null, reason: null },
    { targets: [`/key_people/@${personB}/name`], status: "found", job_id: null, reason: null },
  ],
};
const row = (id: string) =>
  ({
    company_id: company, entry_id: id, kind: "key_person", review_status: "approved",
    content: { id, name: "Pat" }, provenance: shared,
  }) as unknown as ViewEntry;
const rows = [row(personA), row(personB)];
const ids = (list: ViewEntry[]) => list.map((e) => (e as unknown as { entry_id: string }).entry_id);

it("matches an origin filter only through the entry's own claims", () => {
  expect(ids(filterView(rows, { companyId: company, origin: "generated" }))).toEqual([personA]);
  expect(ids(filterView(rows, { companyId: company, origin: "user_provided" }))).toEqual([personB]);
});

it("matches a coverage filter only through the entry's own coverage targets", () => {
  expect(ids(filterView(rows, { companyId: company, coverage: "partial" }))).toEqual([personA]);
  expect(ids(filterView(rows, { companyId: company, coverage: "found" }))).toEqual([personB]);
});
