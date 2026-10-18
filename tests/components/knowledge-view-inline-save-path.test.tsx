// Acceptance, Quest Q7 inline-edit-core, C5: every inline save goes through the existing entries / revisions API.
//
//  - an entry that exists is revised: POST /api/companies/<id>/entries/<entryId>/revisions with expectedRevision (the
//    revision the page holds), content = the stored content with ONLY the edited field changed, reviewStatus
//    "unreviewed", a reason, a fresh requestId. The body satisfies SaveEntrySchema and the entry's own schema.
//  - a company without that entry gets it created: POST /api/companies/<id>/entries { kind, content (defaults plus
//    the edit), provenance, requestId }; the next edit revises the new entry at revision 1.
//  - the real server preparation accepts what the page sends: prepareRevision / prepareManualCreation run on each
//    request and what they would store validates against the contracts.
//  - after a committed save the page re-reads the draft; the next save carries the new revision.
// DECISION: the review status after an inline edit is "unreviewed", as for an import: a changed value needs review again.
import { describe, expect, it, vi } from "vitest";
import { createEmptyBusiness } from "../../src/contracts";
import { buildBusiness, buildEmptyDraft, draftFrom } from "../helpers/knowledge-view-fixtures";
import {
  AREA_FIELDS,
  CHIP_FIELDS,
  COMPANY_ID,
  EMPLOYEES,
  FOUNDED,
  INDUSTRY,
  LEGAL,
  MODEL,
  OVERVIEW_F,
  PITCH_F,
  SINGLE_FIELDS,
  STORY,
  BUYERS,
  UUID,
  addChip,
  creationWrite,
  duplicateIds,
  editAndEnter,
  editButtons,
  entryOf,
  getAt,
  itemsOf,
  key,
  nothingSent,
  one,
  open,
  removeChip,
  revisionWrite,
  serverAcceptsCreation,
  serverAcceptsRevision,
  startEdit,
  stored,
  type,
  withField,
  type TextField,
} from "../helpers/knowledge-view-inline-edit";
import type { View } from "../helpers/knowledge-view-site-all-runtime";

vi.setConfig({ testTimeout: 60_000 });

async function setText(view: View, field: TextField, text: string) {
  if (field.shape === "single") {
    await editAndEnter(view, field, text);
  } else {
    const area = await startEdit(view, field);
    await type(view, area, text);
    await key(view, area, "Enter");
    await view.settle();
  }
}

describe("C5 a revision of an existing entry", () => {
  it.each([...SINGLE_FIELDS, ...AREA_FIELDS])("$label: the request fits the API contract and the real prepareRevision accepts it", async (field) => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    await setText(view, field, "Edited from the view");
    const { content, body } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, field.path, "Edited from the view"));
    expect(view.server.writes).toHaveLength(1);
    const out = await serverAcceptsRevision(before, body);
    expect(getAt(out.content, field.path)).toBe("Edited from the view");
  });

  it("Founded and Employees fit the contract and the real prepareRevision accepts them", async () => {
    for (const [field, text] of [[FOUNDED, "2015"], [EMPLOYEES, "41"]] as const) {
      const view = await open(field.section);
      const before = stored(view, field.kind);
      await editAndEnter(view, field, text);
      const { body } = revisionWrite(view, before);
      await serverAcceptsRevision(before, body);
    }
  });

  it.each(CHIP_FIELDS)("$label: adding and removing an item fit the contract and the real prepareRevision accepts them", async (field) => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    const items = itemsOf(before, field.path);
    await addChip(view, field, "Accepted by the server");
    const added = revisionWrite(view, before, 0);
    const out = await serverAcceptsRevision(before, added.body);
    expect(getAt(out.content, field.path).map((i: { text: string }) => i.text)).toEqual([...items.map((i) => i.text), "Accepted by the server"]);

    const afterAdd = stored(view, field.kind);
    expect(afterAdd.current_revision, "the page re-read the entry it just saved").toBe(before.current_revision + 1);
    await removeChip(view, items[0].text);
    const removed = revisionWrite(view, afterAdd, 1, afterAdd.current_revision);
    const out2 = await serverAcceptsRevision(afterAdd, removed.body);
    expect(getAt(out2.content, field.path).map((i: { text: string }) => i.text)).not.toContain(items[0].text);
  });

  it("each save has its own request id", async () => {
    const view = await open("All sections");
    await setText(view, LEGAL, "Limited partnership");
    await setText(view, OVERVIEW_F, "A second edit");
    const [first, second] = view.server.writes;
    expect(first.body.requestId).toMatch(UUID);
    expect(second.body.requestId).toMatch(UUID);
    expect(first.body.requestId).not.toBe(second.body.requestId);
  });

  it("Pitch and Founding story are saved to the Positioning entry, Overview to the Company Foundation entry", async () => {
    const view = await open("All sections");
    const foundation = stored(view, "company_foundation");
    const positioning = stored(view, "positioning");
    expect(foundation.id).not.toBe(positioning.id);
    await setText(view, OVERVIEW_F, "Overview text");
    await setText(view, STORY, "Story text");
    await setText(view, PITCH_F, "Pitch text");
    expect(view.server.writes.map((w) => w.path)).toEqual([
      `/api/companies/${COMPANY_ID}/entries/${foundation.id}/revisions`,
      `/api/companies/${COMPANY_ID}/entries/${positioning.id}/revisions`,
      `/api/companies/${COMPANY_ID}/entries/${positioning.id}/revisions`,
    ]);
    const third = revisionWrite(view, positioning, 2, positioning.current_revision + 1);
    expect(third.content, "the second Positioning save keeps the first").toEqual({ ...positioning.content, founding_story: "Story text", company_pitch: "Pitch text" });
  });

  it("successive saves of one entry carry the advancing revision and keep the earlier edit", async () => {
    const view = await open("All sections");
    const before = stored(view, "company_foundation");
    await setText(view, LEGAL, "Cooperative");
    await setText(view, INDUSTRY, "Tea trading");
    await addChip(view, BUYERS, "Hotels");
    const first = revisionWrite(view, before, 0, before.current_revision);
    expect(first.content.legal_entity_type).toBe("Cooperative");
    const second = revisionWrite(view, before, 1, before.current_revision + 1);
    expect(second.content).toEqual({ ...before.content, legal_entity_type: "Cooperative", industry: "Tea trading" });
    // Buyers live in another entry: its first revision
    const market = stored(view, "market_and_customers");
    expect(view.server.writes[2].path).toBe(`/api/companies/${COMPANY_ID}/entries/${market.id}/revisions`);
    expect(view.server.writes[2].body.expectedRevision).toBe(market.current_revision - 1);
  });

  it("the page re-reads the draft after a save and shows what the server holds", async () => {
    const view = await open(LEGAL.section);
    const draftReads = () => view.server.gets.filter((r) => r.path.endsWith("/draft")).length;
    await setText(view, LEGAL, "Trust");
    expect(draftReads(), "at least one read of the draft after the write").toBeGreaterThanOrEqual(1);
    const methods = view.server.requests.map((r) => (r.method === "GET" && r.path.endsWith("/draft") ? "read" : r.method));
    expect(methods.indexOf("POST"), "the draft was read again after the write").toBeLessThan(methods.lastIndexOf("read"));
  });

  it("nothing is written just by opening a section, opening an editor, or closing it unchanged", async () => {
    const view = await open("All sections");
    for (const field of [LEGAL, OVERVIEW_F, STORY, PITCH_F, INDUSTRY]) {
      const control = await startEdit(view, field);
      await key(view, control, "Escape");
    }
    nothingSent(view);
  });
});

describe("C5 the same editors in 'All sections'", () => {
  it("every inline editor of the three sections is offered once, with unique ids, and saves", async () => {
    const view = await open("All sections");
    for (const field of [LEGAL, INDUSTRY, OVERVIEW_F, STORY, MODEL, PITCH_F, FOUNDED, EMPLOYEES]) {
      expect(editButtons(view, field.label), `Edit ${field.label}`).toHaveLength(1);
    }
    expect(duplicateIds(view)).toEqual([]);
    const before = stored(view, "company_foundation");
    await setText(view, LEGAL, "Sole proprietorship");
    expect(revisionWrite(view, before).content.legal_entity_type).toBe("Sole proprietorship");
  });
});

describe("C5 an entry the company does not have yet is created", () => {
  it("editing Overview of a company with no entries creates the Company Foundation entry, then revises it", async () => {
    const view = await open("General Info", { draft: buildEmptyDraft() });
    await setText(view, OVERVIEW_F, "A brand new overview");
    expect(view.server.writesTo("revisions"), "no revision of an entry that does not exist").toHaveLength(0);
    const { content, body } = creationWrite(view, "company_foundation");
    expect(content).toEqual({ ...createEmptyBusiness().company_foundation, overview: "A brand new overview" });
    await serverAcceptsCreation(body);
    const created = stored(view, "company_foundation");
    expect(created.current_revision).toBe(1);

    await setText(view, LEGAL, "S corporation");
    expect(view.server.writesTo("entries"), "still one creation").toHaveLength(1);
    const next = revisionWrite(view, created);
    expect(next.content).toEqual({ ...content, legal_entity_type: "S corporation" });
    await serverAcceptsRevision(created, next.body);
  });

  it("Founding story and Pitch create the Positioning entry once", async () => {
    const view = await open("General Info", { draft: buildEmptyDraft() });
    await setText(view, STORY, "How it began");
    const { content, body } = creationWrite(view, "positioning");
    expect(content).toEqual({ ...createEmptyBusiness().positioning, founding_story: "How it began" });
    await serverAcceptsCreation(body);
    const created = stored(view, "positioning");
    const sales = await open("Sales & Marketing", { draft: view.server.draft });
    await setText(sales, PITCH_F, "A one-liner");
    expect(sales.server.writesTo("entries")).toHaveLength(0);
    expect(revisionWrite(sales, created).content).toEqual({ ...content, company_pitch: "A one-liner" });
  });

  it("adding the first Buyer creates the Market & Customers entry with that one item", async () => {
    const view = await open("Customers & Industry", { draft: buildEmptyDraft() });
    await addChip(view, BUYERS, "Cafés");
    const { content, body } = creationWrite(view, "market_and_customers");
    expect(content.target_buyers).toHaveLength(1);
    expect(content.target_buyers[0]).toMatchObject({ text: "Cafés" });
    expect(content.target_buyers[0].id).toMatch(UUID);
    expect({ ...content, target_buyers: [] }).toEqual(createEmptyBusiness().market_and_customers);
    await serverAcceptsCreation(body);
    await addChip(view, BUYERS, "Offices");
    expect(view.server.writesTo("entries")).toHaveLength(1);
    const created = entryOf(view.server.draft, "market_and_customers");
    expect(created.current_revision).toBe(2);
    expect(view.server.writes[1].body.expectedRevision).toBe(1);
  });

  it("a company that has Company Foundation but no Positioning revises the one and creates the other", async () => {
    const business = buildBusiness();
    const draft = draftFrom(business);
    draft.entries = draft.entries.filter((e) => e.kind !== "positioning");
    const view = await open("All sections", { draft });
    const foundation = stored(view, "company_foundation");
    await setText(view, LEGAL, "Nonprofit");
    await setText(view, PITCH_F, "Pitch for a new entry");
    expect(revisionWrite(view, foundation).content.legal_entity_type).toBe("Nonprofit");
    const { content } = creationWrite(view, "positioning");
    expect(content).toEqual({ ...createEmptyBusiness().positioning, company_pitch: "Pitch for a new entry" });
    one(editButtons(view, "Pitch"), "Pitch is editable");
  });
});
