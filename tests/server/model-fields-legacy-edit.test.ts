// Editing an entry saved before the model fields existed: its stored provenance has no coverage for age, nationality or
// portrait, yet every registered field needs exactly one coverage row in the next revision.
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareRevision } from "../../src/server/revisions";
import { createEmptyProvenance, entryBusiness, validateProvenance, type BusinessEntry } from "../../src/contracts";

const company = "10000000-0000-4000-8000-0000000000f0";
const person = "30000000-0000-4000-8000-0000000000f1";
const actor = "40000000-0000-4000-8000-0000000000f2";
const request = "50000000-0000-4000-8000-0000000000f3";
const storedContent = { id: person, name: "Alex Chen", title: null, role: null, gender: null, background_or_relevance: null };
const storedProvenance = {
  ...createEmptyProvenance(),
  claims: [{ id: "70000000-0000-4000-8000-0000000000f4", entry_id: person, targets: [`/key_people/@${person}/name`], origin: "user_provided", evidence_ids: [], based_on_claim_ids: [], actor_id: actor, authored_at: "2026-10-16T05:00:00Z", note: "Entered by hand." }],
  coverage: ["name", "title", "role", "gender", "background_or_relevance"].map((field) => ({ targets: [`/key_people/@${person}/${field}`], status: "not_checked", job_id: null, reason: "Entered manually." })),
};
const client = {
  from: (table: string) => {
    const rows: Record<string, unknown> = {
      knowledge_entries: { kind: "key_person", current_revision: 2 },
      knowledge_entry_versions: { content: storedContent, provenance: storedProvenance },
    };
    const query: any = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: rows[table], error: null }) };
    return query;
  },
};
const save = (content: Record<string, unknown>) =>
  prepareRevision(client as never, company, person, actor, { expectedRevision: 2, content: content as unknown as BusinessEntry, provenance: createEmptyProvenance(), requestId: request, reviewStatus: "unreviewed" });

it("a revision of a legacy person covers the new fields and validates", async () => {
  const out = await save({ ...storedContent, age: 41, nationality: null, portrait: null });
  expect(out.content).toMatchObject({ age: 41, nationality: null, portrait: null });
  const targets = out.provenance.coverage.flatMap((row) => row.targets).sort();
  expect(targets).toEqual(["age", "background_or_relevance", "gender", "name", "nationality", "portrait", "role", "title"].map((field) => `/key_people/@${person}/${field}`));
  expect(validateProvenance(entryBusiness("key_person", out.content), out.provenance)).toEqual([]);
});

it("saving a legacy person unchanged reads as unchanged: no new claim, the new fields only gain coverage", async () => {
  const out = await save({ ...storedContent, age: null, nationality: null, portrait: null });
  expect(out.provenance.claims).toEqual(storedProvenance.claims);
  expect(out.provenance.coverage).toHaveLength(8);
});
