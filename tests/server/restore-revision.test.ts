// Undo of a removed list item: the real prepareRevision puts the item back with the claims and
// evidence it had in the earlier revision it is restored from, instead of recording the person as its author, and falls
// back to an ordinary edit for anything that does not match. The browser's own provenance is never used.
import { describe, expect, it } from "vitest";
import { prepareRevision } from "../../src/server/revisions";
import { SaveEntrySchema } from "../../src/contracts/api-entries";
import { createEmptyBusiness, createEmptyProvenance, entryBusiness, validateProvenance, type BusinessEntry, type EntryProvenance } from "../../src/contracts";
import { reviseProvenance } from "../../src/knowledge/revise-provenance";

const company = "10000000-0000-4000-8000-0000000000a0";
const entry = "20000000-0000-4000-8000-0000000000a1";
const actor = "40000000-0000-4000-8000-0000000000a2";
const buyerId = "30000000-0000-4000-8000-0000000000a3";
const otherId = "30000000-0000-4000-8000-0000000000a4";
const sourceId = "50000000-0000-4000-8000-0000000000a5";
const evidenceId = "60000000-0000-4000-8000-0000000000a6";
const claimId = "70000000-0000-4000-8000-0000000000a7";
const otherClaimId = "70000000-0000-4000-8000-0000000000a8";
const request = "80000000-0000-4000-8000-0000000000a9";
const leaf = (id: string) => `/market_and_customers/target_buyers/@${id}/text`;
const buyer = { id: buyerId, text: "Independent cafes" };
const other = { id: otherId, text: "Offices" };
const content = (...items: { id: string; text: string }[]) => ({ ...createEmptyBusiness().market_and_customers, target_buyers: items }) as BusinessEntry;

const provenance1: EntryProvenance = {
  ...createEmptyProvenance(),
  sources: [{ id: sourceId, url: "https://acme.example/", title: "Acme", author: null, site_name: null, published_on: null, retrieved_at: "2026-10-16T00:00:00.000Z" }],
  evidence: [{ id: evidenceId, source_page_id: sourceId, kind: "text", excerpt: "We sell to independent cafes.", technical: null }],
  claims: [
    { id: claimId, entry_id: entry, targets: [leaf(buyerId)], origin: "source_backed", evidence_ids: [evidenceId], based_on_claim_ids: [], actor_id: null, authored_at: null, note: "From the website" },
    { id: otherClaimId, entry_id: entry, targets: [leaf(otherId)], origin: "user_provided", evidence_ids: [], based_on_claim_ids: [], actor_id: actor, authored_at: "2026-10-16T00:00:00.000Z", note: "Entered by hand" },
  ],
};
// Revision 2: the buyer removed (as the ordinary edit does it).
const provenance2 = reviseProvenance({ kind: "market_and_customers", entryId: entry, before: content(buyer, other), after: content(other), provenance: provenance1, actorId: actor, savedAt: "2026-10-16T01:00:00.000Z", requestId: "90000000-0000-4000-8000-0000000000aa", note: "Removed buyer" });

interface Row { company_id: string; entry_id: string; revision: number; content: BusinessEntry; provenance: EntryProvenance }
const rows: Row[] = [
  { company_id: company, entry_id: entry, revision: 1, content: content(buyer, other), provenance: provenance1 },
  { company_id: company, entry_id: entry, revision: 2, content: content(other), provenance: provenance2 },
];
/** A client that answers like the database: only rows matching every filter the server asked for. */
const clientOver = (stored: Row[], ignoreFilters = false) => ({
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => (filters.push([column, value]), query),
      maybeSingle: () => {
        const data =
          table === "knowledge_entries"
            ? { kind: "market_and_customers", current_revision: 2 }
            : (stored.find((row) => ignoreFilters || filters.every(([column, value]) => (row as unknown as Record<string, unknown>)[column] === value)) ?? null);
        return Promise.resolve({ data, error: null });
      },
    };
    return query;
  },
});
const save = (body: { content: BusinessEntry; restoreFrom?: { revision: number; itemIds: string[] }; provenance?: EntryProvenance }, client = clientOver(rows), expectedRevision = 2) =>
  prepareRevision(client as never, company, entry, actor, {
    expectedRevision,
    content: body.content,
    provenance: body.provenance ?? createEmptyProvenance(),
    requestId: request,
    reviewStatus: "unreviewed",
    reason: "Restored the buyer list after a removal.",
    restoreFrom: body.restoreFrom,
  });
const claimFor = (provenance: EntryProvenance, id: string) => provenance.claims.find((claim) => claim.targets.includes(leaf(id)))!;

describe("Undo carries an item's original claims over", () => {
  it("the request shape accepts restoreFrom and nothing else extra", () => {
    const body = { expectedRevision: 2, content: content(buyer, other), provenance: createEmptyProvenance(), reviewStatus: "unreviewed", requestId: request };
    expect(SaveEntrySchema.safeParse({ ...body, restoreFrom: { revision: 1, itemIds: [buyerId] } }).success).toBe(true);
    expect(SaveEntrySchema.safeParse({ ...body, restoreFrom: { revision: 1, itemIds: [] } }).success).toBe(false);
    expect(SaveEntrySchema.safeParse({ ...body, restoreFrom: { revision: 1, itemIds: [buyerId], extra: 1 } }).success).toBe(false);
  });

  it("a source-backed buyer comes back source-backed, with its evidence and source", async () => {
    const out = await save({ content: content(other, buyer), restoreFrom: { revision: 1, itemIds: [buyerId] } });
    const claim = claimFor(out.provenance, buyerId);
    expect(claim).toMatchObject({ origin: "source_backed", evidence_ids: [evidenceId], actor_id: null, note: "From the website", entry_id: entry });
    expect(claim.id, "a new id: the original may have been narrowed since").not.toBe(claimId);
    expect(out.provenance.evidence.map((row) => row.id)).toEqual([evidenceId]);
    expect(out.provenance.sources.map((row) => row.id)).toEqual([sourceId]);
    expect(validateProvenance(entryBusiness("market_and_customers", out.content), out.provenance)).toEqual([]);
    // the other item is untouched
    expect(claimFor(out.provenance, otherId)).toMatchObject({ id: otherClaimId, origin: "user_provided" });
  });

  it("the same request twice gives the same claim ids (a retry is the same save)", async () => {
    const a = await save({ content: content(other, buyer), restoreFrom: { revision: 1, itemIds: [buyerId] } });
    const b = await save({ content: content(other, buyer), restoreFrom: { revision: 1, itemIds: [buyerId] } });
    expect(claimFor(a.provenance, buyerId).id).toBe(claimFor(b.provenance, buyerId).id);
  });

  it("the browser's own provenance is not used: forged claims and evidence are dropped", async () => {
    const forged: EntryProvenance = { ...provenance1, claims: [{ ...provenance1.claims[0], id: "70000000-0000-4000-8000-0000000000ff", note: "Forged" }], evidence: [{ ...provenance1.evidence[0], id: "60000000-0000-4000-8000-0000000000ff", excerpt: "Forged" }] };
    const out = await save({ content: content(other, buyer), provenance: forged, restoreFrom: { revision: 1, itemIds: [buyerId] } });
    expect(JSON.stringify(out.provenance)).not.toContain("Forged");
  });

  it("tampered content falls back to an ordinary edit: the person is the author", async () => {
    const out = await save({ content: content(other, { ...buyer, text: "Everyone" }), restoreFrom: { revision: 1, itemIds: [buyerId] } });
    expect(claimFor(out.provenance, buyerId)).toMatchObject({ origin: "user_provided", actor_id: actor, evidence_ids: [] });
    expect(out.provenance.evidence).toEqual([]);
  });

  it("an item the earlier revision did not have, or one that was typed by a person, falls back too", async () => {
    const fresh = { id: "30000000-0000-4000-8000-0000000000b0", text: "New" };
    const out = await save({ content: content(other, buyer, fresh), restoreFrom: { revision: 1, itemIds: [fresh.id, buyerId] } });
    expect(claimFor(out.provenance, fresh.id)).toMatchObject({ origin: "user_provided", actor_id: actor });
    expect(claimFor(out.provenance, buyerId).origin).toBe("source_backed");
    // restoring the person-typed item records the person again rather than copying an old claim
    const typed = await save({ content: content(buyer, other), restoreFrom: { revision: 1, itemIds: [otherId] } }, clientOver([{ ...rows[0], content: content(buyer, other) }, { ...rows[1], content: content(buyer), provenance: reviseProvenance({ kind: "market_and_customers", entryId: entry, before: content(buyer, other), after: content(buyer), provenance: provenance1, actorId: actor, savedAt: "2026-10-16T01:00:00.000Z", requestId: "90000000-0000-4000-8000-0000000000ab", note: "Removed" }) }]));
    expect(claimFor(typed.provenance, otherId).id).not.toBe(otherClaimId);
  });

  it("a revision that is not there for this company and entry is refused, even if a client answered with someone else's row", async () => {
    const strange = [{ ...rows[0], entry_id: "20000000-0000-4000-8000-0000000000bb" }, { ...rows[0], company_id: "10000000-0000-4000-8000-0000000000bb" }];
    for (const stored of [[...strange, rows[1]], [rows[1]]]) {
      await expect(save({ content: content(other, buyer), restoreFrom: { revision: 1, itemIds: [buyerId] } }, clientOver(stored))).rejects.toMatchObject({ status: 422 });
    }
    await expect(save({ content: content(other, buyer), restoreFrom: { revision: 1, itemIds: [buyerId] } }, clientOver(strange, true))).rejects.toMatchObject({ status: 422 });
  });

  it("a revision that is not earlier than the one being saved over is refused", async () => {
    await expect(save({ content: content(other, buyer), restoreFrom: { revision: 2, itemIds: [buyerId] } })).rejects.toMatchObject({ status: 422 });
  });

  it("without restoreFrom nothing changes: the buyer is a person's own claim", async () => {
    const out = await save({ content: content(other, buyer) });
    expect(claimFor(out.provenance, buyerId)).toMatchObject({ origin: "user_provided", actor_id: actor });
  });
});
