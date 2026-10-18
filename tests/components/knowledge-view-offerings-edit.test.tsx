// Acceptance, Quest Q8 offerings-brand-edit, A: Business Offerings edit in place (owner, draft version).
//
// Public contract (roles, names, requests; no class names, no structure):
//  - "Add offering" in the section head creates one offering named "Untitled Offering" and selects it.
//  - "Delete <title>" deletes the selected offering with no confirm dialog; a role=status toast says
//    `Deleted “<name>”.` and has "Undo", which restores it (POST .../entries/:entryId/restore). A failed delete shows role=alert.
//  - "Edit Offering name / type / description / cost", chips "Add key feature" / "Remove <feature>" save one revision.
//  - Cost: a plain decimal; anything else is refused inline; empty clears the price.
//  - A viewer or a snapshot has none of these controls; the read-only "+ Add Offering" link stays there.
// DECISION (coordinator, round 2): Undo restores the archived entry with POST .../entries/:entryId/restore (it keeps its evidence).
import { describe, expect, it, vi } from "vitest";
import {
  UUID,
  addChip,
  alertText,
  blur,
  click,
  creationWrite,
  editAndEnter,
  editButton,
  key,
  nothingSent,
  pageText,
  removeChip,
  revisionWrite,
  startEdit,
  statusText,
  focusedIs,
  type,
  buttonNamed,
  withField,
  textboxes,
  valueOf,
  COMPANY_ID,
  type ChipField,
} from "../helpers/knowledge-view-inline-edit";
import {
  OFFERINGS,
  OFFERING_IDS,
  offeringsSnapshot,
} from "../helpers/knowledge-view-offerings-brand-fixtures";
import { VERSIONS } from "../helpers/knowledge-view-fixtures";
import {
  currentTitles,
  editingControls,
  isCurrent,
  lastNavParam,
  listTitles,
  mustButton,
  offeringButton,
  offeringsDraftAs,
  openOB,
  selectOffering,
  storedById,
  toastStatus,
  buttonsNamed,
} from "../helpers/knowledge-view-offerings-brand-edit";

vi.setConfig({ testTimeout: 60_000 });

const FIRST = OFFERINGS[0];
const TITLE = FIRST.name!;
const KEY_FEATURE: ChipField = { id: "feature", section: "Business Offerings", label: "Key features", noun: "key feature", kind: "offering", path: ["features"] };
const open = () => openOB("Business Offerings");

describe("A0 read-only views have no editing controls", () => {
  it.each([
    ["a viewer's draft", () => ({ draft: offeringsDraftAs("viewer") })],
    ["a saved snapshot", () => ({ snapshot: offeringsSnapshot(), versions: VERSIONS })],
  ])("%s: no Add / Delete / Edit / text field, and the '+ Add Offering' link stays", async (_name, make) => {
    const { view, server } = await openOB("Business Offerings", make());
    expect(editingControls(view).map((n) => view.nameOf(n))).toEqual([]);
    expect(view.all().some((n) => n.tag === "a" && view.text(n) === "+ Add Offering"), "the read-only add link").toBe(true);
    nothingSent(view);
    expect(server.writes).toEqual([]);
  });
});

describe("A1 Add offering", () => {
  it("an editable draft has a button 'Add offering' and no '+ Add Offering' link", async () => {
    const { view } = await open();
    mustButton(view, "Add offering");
    expect(view.all().some((n) => n.tag === "a" && view.text(n) === "+ Add Offering")).toBe(false);
  });

  it("creates one 'Untitled Offering' with a fresh id and otherwise empty fields, then re-reads the draft", async () => {
    const { view, server } = await open();
    await click(view, mustButton(view, "Add offering"));
    await view.settle(8);
    expect(server.writes, "exactly one write").toHaveLength(1);
    const { content } = creationWrite(view, "offering");
    expect(content.id).toMatch(UUID);
    expect(OFFERING_IDS as readonly string[]).not.toContain(content.id);
    expect(content.name).toBe("Untitled Offering");
    expect(content.features).toEqual([]);
    expect(content.pricing ?? null).toBeNull();
    expect(content.description ?? null).toBeNull();
    expect(server.gets.filter((r) => r.path.endsWith("/draft")).length, "the draft is read again").toBeGreaterThanOrEqual(1);
  });

  it("the new offering is listed, selected (aria-current, ?offering=<id>) and its list button is focused", async () => {
    const { view } = await open();
    await click(view, mustButton(view, "Add offering"));
    await view.settle(8);
    const { content } = creationWrite(view, "offering");
    expect(listTitles(view).some((t) => t.startsWith("Untitled Offering"))).toBe(true);
    expect(currentTitles(view).map((t) => t.startsWith("Untitled Offering"))).toEqual([true]);
    expect(lastNavParam("offering")).toBe(content.id);
    const button = offeringButton(view, "Untitled Offering")!;
    expect(isCurrent(button) && focusedIs(button), "selected and focused").toBe(true);
  });
});

describe("A2 Delete offering", () => {
  it(`'Delete <title>' sends one DELETE with the current revision and a request id, with no confirm dialog`, async () => {
    const { view, api } = await open();
    const before = storedById(view, FIRST.id);
    await click(view, mustButton(view, `Delete ${TITLE}`));
    await view.settle(8);
    expect(view.dialogs(), "no confirm dialog").toHaveLength(0);
    expect(api.deletes).toHaveLength(1);
    expect(api.deletes[0].path).toBe(`/api/companies/${COMPANY_ID}/entries/${FIRST.id}`);
    expect(api.deletes[0].body).toEqual({ expectedRevision: before.current_revision, requestId: expect.stringMatching(UUID) });
    expect(listTitles(view).some((t) => t.startsWith(TITLE)), "the offering left the list").toBe(false);
  });

  it("a status says 'Deleted “<name>”.' and offers Undo", async () => {
    const { view } = await open();
    await click(view, mustButton(view, `Delete ${TITLE}`));
    await view.settle(8);
    expect(toastStatus(view, new RegExp(`Deleted “${TITLE}”\\.`)), "a role=status toast").not.toBeNull();
    mustButton(view, "Undo");
  });

  it("Undo restores the archived offering with one restore request, selects it, and the toast goes away", async () => {
    const { view, server, api } = await open();
    const before = storedById(view, FIRST.id);
    await click(view, mustButton(view, `Delete ${TITLE}`));
    await view.settle(8);
    await click(view, mustButton(view, "Undo"));
    await view.settle(8);
    expect(api.restores, "exactly one restore request").toHaveLength(1);
    expect(api.restores[0].path).toBe(`/api/companies/${COMPANY_ID}/entries/${FIRST.id}/restore`);
    expect(server.writesTo("entries"), "the offering is not created again").toHaveLength(0);
    expect(storedById(view, FIRST.id).content).toEqual(before.content);
    expect(listTitles(view).some((t) => t.startsWith(TITLE))).toBe(true);
    expect(currentTitles(view).map((t) => t.startsWith(TITLE))).toEqual([true]);
    expect(buttonsNamed(view, "Undo"), "the toast is gone").toHaveLength(0);
    expect(toastStatus(view, /^Deleted/)).toBeNull();
  });

  it("a failed delete shows the server's message in a role=alert and the offering stays", async () => {
    const { view, server } = await open();
    server.writeFailure = { status: 500, message: "Delete is down." };
    await click(view, mustButton(view, `Delete ${TITLE}`));
    await view.settle(8);
    expect(alertText(view)).toContain("Delete is down.");
    expect(listTitles(view).some((t) => t.startsWith(TITLE))).toBe(true);
  });
});

describe("A3 text fields", () => {
  it("name: Enter saves one revision with only the name changed, then '✓ Saved'", async () => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    await editAndEnter(view, { label: "Offering name" }, "Renamed Subscription");
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, ["name"], "Renamed Subscription"));
    expect(statusText(view)).toMatch(/saved/i);
  });

  it("type: blur saves one revision with only the type changed", async () => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    const input = await startEdit(view, { label: "Offering type" });
    await type(view, input, "Bundle");
    await blur(view, input);
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, ["offering_type"], "Bundle"));
  });

  it("unchanged text sends nothing; Escape cancels and restores the button", async () => {
    const { view } = await open();
    const same = await startEdit(view, { label: "Offering name" });
    await key(view, same, "Enter");
    nothingSent(view, "unchanged text");
    const input = await startEdit(view, { label: "Offering name" });
    await type(view, input, "Abandoned");
    await key(view, input, "Escape");
    nothingSent(view, "Escape");
    expect(textboxes(view, "Offering name")).toHaveLength(0);
    expect(view.text(editButton(view, "Offering name"))).toContain(TITLE);
  });

  it("description: a textarea with Save and Cancel; Save writes one revision", async () => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    const area = await startEdit(view, { label: "Offering description" });
    expect(area.tag).toBe("textarea");
    expect(buttonNamed(view, /^cancel$/i), "a Cancel button").toBeDefined();
    await type(view, area, "A new description.");
    await click(view, buttonNamed(view, /^save$/i));
    await view.settle();
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, ["description"], "A new description."));
  });

  it("key features: Add appends {id, text} last", async () => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    await addChip(view, KEY_FEATURE, "Tasting notes card");
    const added = revisionWrite(view, before).content.features;
    expect(added.slice(0, 3)).toEqual(before.content.features);
    expect(added[3]).toEqual({ id: expect.stringMatching(UUID), text: "Tasting notes card" });
  });

  it("key features: Remove drops that feature", async () => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    await removeChip(view, "Free shipping over forty dollars");
    const kept = revisionWrite(view, before).content.features.map((f: any) => f.text);
    expect(kept).toEqual(["Roasted to order", "Pause or skip any month"]);
  });
});

describe("A3 cost", () => {
  it.each(["49.99", "0.5", "1200.50", "12"])("typing %s saves a paid price and keeps the other pricing fields", async (text) => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    await editAndEnter(view, { label: "Offering cost" }, text);
    const { content } = revisionWrite(view, before);
    expect(content.pricing).toEqual({ ...before.content.pricing, kind: "paid", amount: text, raw: text, min_amount: null, max_amount: null });
    expect(pageText(view)).toContain(text);
  });

  it.each(["abc", "12.", ".5", "1.2.3", "$5"])("%s sends nothing and shows the number hint", async (text) => {
    const { view } = await open();
    await editAndEnter(view, { label: "Offering cost" }, text);
    nothingSent(view);
    expect(alertText(view)).toContain("Enter a number, for example 49.99.");
  });

  it("a negative number sends nothing and says it cannot be negative", async () => {
    const { view } = await open();
    await editAndEnter(view, { label: "Offering cost" }, "-5");
    nothingSent(view);
    expect(alertText(view)).toContain("cannot be negative");
  });

  it("clearing the text saves no price", async () => {
    const { view } = await open();
    const before = storedById(view, FIRST.id);
    await editAndEnter(view, { label: "Offering cost" }, "");
    expect(revisionWrite(view, before).content.pricing).toBeNull();
  });
});

describe("A3 a second offering", () => {
  it("editing the second offering writes to its own entry", async () => {
    const { view } = await open();
    const second = OFFERINGS[1];
    await selectOffering(view, second.name!);
    const before = storedById(view, second.id);
    await editAndEnter(view, { label: "Offering name" }, "Wholesale, renamed");
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, ["name"], "Wholesale, renamed"));
  });

  it("a typed-but-unsaved draft of offering 1 is not shown for offering 2", async () => {
    const { view } = await open();
    const input = await startEdit(view, { label: "Offering name" });
    await type(view, input, "Typed, not saved");
    await selectOffering(view, OFFERINGS[1].name!);
    expect(pageText(view)).not.toContain("Typed, not saved");
    const inputs = textboxes(view, "Offering name");
    expect(inputs.map((n) => valueOf(view, n)).join("|")).not.toContain("Typed, not saved");
  });
});
