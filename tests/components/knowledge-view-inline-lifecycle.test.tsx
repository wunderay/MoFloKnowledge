// Quest Q7 inline-edit-core, review follow-up (not part of the locked acceptance files): what happens to an edit
// around it, not inside it.
//  - a save that fails after the section was left is shown, with the typed text and a Retry, when it is visible again;
//  - saves of one entry run one after another, each on the revision the view shows (no stale-revision race, one creation);
//  - text typed in an editor (textarea, chip field) survives a change of section;
//  - after Remove and Undo, focus goes to a chip or the Add control, never to the page body;
//  - the "Edit <Field>" button keeps its name and is described by the value it shows;
//  - focus is not taken back after a save when the person has moved on.
// Undo is a new revision of the list (a revert would need the revert endpoint, which the locked tests do not allow).
import { describe, expect, it, vi } from "vitest";
import { buildEmptyDraft } from "../helpers/knowledge-view-fixtures";
import { focusPath, focusedPath, type View } from "../helpers/knowledge-view-site-all-runtime";
import {
  BUYERS,
  INDUSTRY,
  LEGAL,
  OVERVIEW_F,
  addPill,
  addInputs,
  alertText,
  alerts,
  blur,
  chipInput,
  click,
  editAndEnter,
  editButton,
  itemsOf,
  key,
  one,
  open,
  removeButtons,
  removeChip,
  revisionWrite,
  startEdit,
  stored,
  textboxes,
  type,
  undoButtons,
  valueOf,
  creationWrite,
} from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });

/** Chooses a section in the "Knowledge section" listbox, as a person does. */
async function switchTo(view: View, label: string) {
  await click(view, one(view.byRole("button", /knowledge section/i), "the section button"));
  await click(view, one(view.byRole("option", label), `the "${label}" option`));
}
async function typeInArea(view: View, text: string) {
  const area = await startEdit(view, OVERVIEW_F);
  await type(view, area, text);
  await key(view, area, "Enter");
  await view.settle();
}

describe("a save that finishes after the section was left", () => {
  it("a failed blur-save shows its message, the typed text and Retry when the section is shown again", async () => {
    const view = await open("General Info");
    const before = stored(view, LEGAL.kind);
    const input = await startEdit(view, LEGAL);
    await type(view, input, "Typed, then the section changed");
    view.server.hold();
    view.server.writeFailure = { status: 503, message: "Draft store is down." };
    await blur(view, input);
    await switchTo(view, "Customers & Industry");
    expect(textboxes(view, LEGAL.label), "the field is not on this section").toHaveLength(0);
    view.server.release();
    await view.settle();
    await switchTo(view, "General Info");
    expect(alertText(view), "the failure is not lost").toContain("Draft store is down.");
    const box = one(textboxes(view, LEGAL.label), "the editor is open again");
    expect(valueOf(view, box)).toBe("Typed, then the section changed");
    view.server.writeFailure = null;
    await click(view, one(view.byRole("button", /^retry$/i), "Retry"));
    expect(view.server.writes).toHaveLength(2);
    expect(view.server.writes[1]!.body.requestId).toBe(view.server.writes[0]!.body.requestId);
    expect(revisionWrite(view, before, 1, before.current_revision).content.legal_entity_type).toBe("Typed, then the section changed");
    expect(alerts(view)).toHaveLength(0);
    expect(view.text(editButton(view, LEGAL.label))).toContain("Typed, then the section changed");
  });

  it("a save that succeeds while the section is away is shown as saved when it is back", async () => {
    const view = await open("General Info");
    const input = await startEdit(view, LEGAL);
    await type(view, input, "Saved while away");
    view.server.hold();
    await blur(view, input);
    await switchTo(view, "Customers & Industry");
    view.server.release();
    await view.settle();
    await switchTo(view, "General Info");
    expect(textboxes(view, LEGAL.label), "the editor closed itself").toHaveLength(0);
    expect(view.text(editButton(view, LEGAL.label))).toContain("Saved while away");
    expect(view.server.writes).toHaveLength(1);
  });
});

describe("saves of one entry never race", () => {
  it("two edits of the Company Foundation entry sent back to back are written in turn, the second on the new revision", async () => {
    const view = await open("All sections");
    const before = stored(view, LEGAL.kind);
    view.server.hold();
    await editAndEnter(view, LEGAL, "Cooperative");
    await editAndEnter(view, INDUSTRY, "Tea trading");
    expect(view.server.writes, "the second waits for the first").toHaveLength(1);
    view.server.release();
    await view.settle();
    expect(view.server.writes).toHaveLength(2);
    expect(alerts(view), "no stale-revision message").toHaveLength(0);
    expect(revisionWrite(view, before, 0, before.current_revision).content.legal_entity_type).toBe("Cooperative");
    const second = revisionWrite(view, before, 1, before.current_revision + 1);
    expect(second.content).toEqual({ ...before.content, legal_entity_type: "Cooperative", industry: "Tea trading" });
    expect(view.text(editButton(view, INDUSTRY.label))).toContain("Tea trading");
  });

  it("two first edits of a company without entries create the entry once and revise it", async () => {
    const view = await open("All sections", { draft: buildEmptyDraft() });
    view.server.hold();
    await typeInArea(view, "A first overview");
    await editAndEnter(view, LEGAL, "S corporation");
    view.server.release();
    await view.settle();
    expect(view.server.writesTo("entries"), "one creation").toHaveLength(1);
    expect(view.server.writesTo("revisions"), "then one revision").toHaveLength(1);
    expect(alerts(view)).toHaveLength(0);
    const created = creationWrite(view, "company_foundation");
    expect(created.content.overview).toBe("A first overview");
    const revised = view.server.writesTo("revisions")[0]!;
    expect(revised.body.expectedRevision).toBe(1);
    expect(revised.body.content).toEqual({ ...created.content, legal_entity_type: "S corporation" });
  });
});

describe("what is typed survives a change of section", () => {
  it("a paragraph being edited is still open, with its text, when its section is shown again", async () => {
    const view = await open("General Info");
    const area = await startEdit(view, OVERVIEW_F);
    await type(view, area, "Half written");
    await switchTo(view, "Sales & Marketing");
    await switchTo(view, "General Info");
    const back = one(textboxes(view, OVERVIEW_F.label), "the textarea is open again");
    expect(valueOf(view, back)).toBe("Half written");
    expect(view.server.writes).toHaveLength(0);
  });

  it("text typed in a chip list's add field is still there when its section is shown again", async () => {
    const view = await open("Customers & Industry");
    const input = await chipInput(view, BUYERS);
    await type(view, input, "Half typed buyer");
    await switchTo(view, "Sales & Marketing");
    await switchTo(view, "Customers & Industry");
    expect(valueOf(view, one(addInputs(view, BUYERS), "the add field is open again"))).toBe("Half typed buyer");
    expect(view.server.writes).toHaveLength(0);
  });
});

describe("focus after Remove and Undo", () => {
  it("Remove moves focus to the next chip, or to Add after the last one; Undo to the restored chip", async () => {
    const view = await open("Customers & Industry");
    const items = itemsOf(stored(view, BUYERS.kind), BUYERS.path);
    await removeChip(view, items[1]!.text);
    expect(focusedPath(), "focus is not left on the page body").not.toBeNull();
    expect(focusedPath()).toBe(one(removeButtons(view, items[2]!.text), "next chip").path);
    await click(view, one(undoButtons(view), "Undo"));
    expect(focusedPath()).toBe(one(removeButtons(view, items[1]!.text), "restored chip").path);

    await removeChip(view, items[items.length - 1]!.text);
    expect(focusedPath(), "after the last chip, the Add control").toBe(one(addPill(view, BUYERS), "Add").path);
  });
});

describe("the edit button", () => {
  it("is named 'Edit <Field>' and described by the value it shows", async () => {
    const view = await open("General Info");
    const button = editButton(view, LEGAL.label);
    const id = button.props["aria-describedby"] as string;
    expect(id, "aria-describedby points at the value").toBeTruthy();
    const described = view.all().find((n) => n.props.id === id);
    expect(view.text(described!)).toBe("Limited Liability Company (LLC)");
    expect(view.nameOf(button)).toBe("Edit Legal entity");
  });
});

describe("focus after a save", () => {
  it("returns to the button, unless the person has moved on in the meantime", async () => {
    const view = await open("General Info");
    const input = await startEdit(view, LEGAL);
    await type(view, input, "Partnership");
    view.server.hold();
    await key(view, input, "Enter");
    const elsewhere = editButton(view, OVERVIEW_F.label);
    focusPath(elsewhere.path);
    view.server.release();
    await view.settle();
    expect(focusedPath(), "focus stays where the person put it").toBe(elsewhere.path);
  });
});
