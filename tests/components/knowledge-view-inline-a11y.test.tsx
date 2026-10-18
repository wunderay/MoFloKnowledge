// Accessible names, roles and keyboard use of the inline editors.
//
//  - an editable value is a button (a <button>, or role="button" that is a tab stop and handles Enter and Space)
//    named "Edit <Field>"; its pencil icon is hidden from assistive technology.
//  - Enter and Space on that button open the editor; the editor's text control is labelled with the field name;
//    Save / Cancel buttons are named; chip controls are named "Remove <item>" and "Add <noun>".
//  - progress is announced through role="status" ("Saving…", "✓ Saved", the Undo toast), failures through role="alert".
//  - focus is never dropped: it goes into the editor when it opens and back to the "Edit <Field>" button when the
//    editor closes by Escape, Cancel or a successful save.
import { describe, expect, it, vi } from "vitest";
import { roleOf } from "../helpers/knowledge-view-site-all-runtime";
import {
  AREA_FIELDS,
  BUYERS,
  EMPLOYEES,
  FOUNDED,
  SINGLE_FIELDS,
  TEXT_FIELDS,
  alertText,
  alerts,
  buttonNamed,
  chipInput,
  click,
  duplicateIds,
  editButton,
  editAndEnter,
  focusedIs,
  hasPencil,
  key,
  open,
  removeChip,
  startEdit,
  statusText,
  statuses,
  textboxes,
  type,
  one,
  typable,
  type TextField,
} from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });

const ALL_TEXT: { section: TextField["section"]; label: string }[] = [...TEXT_FIELDS, FOUNDED, EMPLOYEES];

describe.each(ALL_TEXT)("$label", (field) => {
  it("is a keyboard-operable button named 'Edit <Field>' with a hidden pencil", async () => {
    const view = await open(field.section);
    const button = editButton(view, field.label);
    expect(roleOf(button)).toBe("button");
    if (button.tag !== "button") {
      expect(button.props.tabIndex, "a role=button element must be a tab stop").toBe(0);
      expect(typeof button.props.onKeyDown, "and handle the keyboard itself").toBe("function");
    }
    expect(hasPencil(button), "pencil is aria-hidden").toBe(true);
  });

  it("Enter opens the editor, and so does Space", async () => {
    for (const keyName of ["Enter", " "]) {
      const view = await open(field.section);
      await key(view, editButton(view, field.label), keyName);
      expect(textboxes(view, field.label), `${JSON.stringify(keyName)} opens the editor`).toHaveLength(1);
      expect(view.byRole("alert"), "opening raises no alert").toHaveLength(0);
    }
  });

  it("the editor's text control has an accessible name that contains the field name", async () => {
    const view = await open(field.section);
    const input = await startEdit(view, field);
    expect(view.nameOf(input).toLowerCase()).toContain(field.label.toLowerCase());
  });
});

describe.each(AREA_FIELDS)("$label editor buttons", (field) => {
  it("Save and Cancel are named buttons", async () => {
    const view = await open(field.section);
    await startEdit(view, field);
    one(view.byRole("button", /^save\b/i), "a Save button");
    one(view.byRole("button", /^cancel\b/i), "a Cancel button");
  });
});

describe("status and alert roles", () => {
  it("'Saving…' and '✓ Saved' are role=status; a failure is role=alert and not a status", async () => {
    const view = await open("General Info");
    view.server.hold();
    const input = await startEdit(view, SINGLE_FIELDS[0]);
    await type(view, input, "Announced");
    await key(view, input, "Enter");
    expect(statusText(view)).toMatch(/saving/i);
    expect(alerts(view)).toHaveLength(0);
    view.server.release();
    await view.settle();
    expect(statusText(view)).toMatch(/✓\s*Saved/);
    expect(alerts(view)).toHaveLength(0);

    view.server.writeFailure = { status: 503, message: "Draft store is down." };
    await editAndEnter(view, SINGLE_FIELDS[0], "Not announced as saved");
    expect(alertText(view)).toContain("Draft store is down.");
    expect(statuses(view).map((s) => s.props.role)).not.toContain("alert");
    expect(statusText(view)).not.toMatch(/saving/i);
  });

  it("a validation message is a role=alert", async () => {
    const view = await open("General Info");
    await editAndEnter(view, FOUNDED, "nope");
    expect(alerts(view)).toHaveLength(1);
  });

  it("the Undo toast is a role=status region with a named Undo button", async () => {
    const view = await open(BUYERS.section);
    await removeChip(view, "Independent cafés and restaurants in New England");
    const toast = statuses(view).find((s) => /removed/i.test(view.text(s)) || view.byRole("button", /^undo\b/i, s).length > 0);
    expect(toast, "a status region announces the removal").toBeDefined();
    expect(view.byRole("button", /^undo\b/i)).toHaveLength(1);
  });
});

describe("chip controls", () => {
  it("Remove buttons are named by their item (the × is not part of the name) and the add field by its noun", async () => {
    const view = await open(BUYERS.section);
    const remove = view.byRole("button", /^remove /i);
    expect(remove.length).toBeGreaterThanOrEqual(4);
    for (const button of remove) {
      expect(view.nameOf(button)).not.toMatch(/[×✕✖]/);
    }
    const input = await chipInput(view, BUYERS);
    expect(view.nameOf(input)).toMatch(/^add buyer/i);
  });
});

describe("focus is never dropped", () => {
  it.each([...SINGLE_FIELDS, ...AREA_FIELDS])("$label: Escape returns focus to the button", async (field) => {
    const view = await open(field.section);
    const control = await startEdit(view, field);
    await key(view, control, "Escape");
    expect(focusedIs(editButton(view, field.label))).toBe(true);
  });

  it.each([...SINGLE_FIELDS, ...AREA_FIELDS])("$label: a successful save by Enter returns focus to the button", async (field) => {
    const view = await open(field.section);
    const control = await startEdit(view, field);
    await type(view, control, "Saved with the keyboard");
    await key(view, control, "Enter");
    await view.settle();
    expect(textboxes(view, field.label)).toHaveLength(0);
    expect(focusedIs(editButton(view, field.label))).toBe(true);
  });

  it("Cancel returns focus to the button", async () => {
    const view = await open(AREA_FIELDS[0].section);
    const area = await startEdit(view, AREA_FIELDS[0]);
    await type(view, area, "changed");
    await click(view, buttonNamed(view, /^cancel\b/i));
    expect(focusedIs(editButton(view, AREA_FIELDS[0].label))).toBe(true);
  });
});

describe("the page stays well formed with editors open", () => {
  it("opening every kind of editor in All sections leaves ids unique and every text control named", async () => {
    const view = await open("All sections");
    for (const field of [...SINGLE_FIELDS, ...AREA_FIELDS, FOUNDED, EMPLOYEES]) {
      await click(view, editButton(view, field.label));
    }
    await chipInput(view, BUYERS);
    expect(duplicateIds(view)).toEqual([]);
    for (const control of typable(view)) {
      expect(view.nameOf(control), "every text control has a name").not.toBe("");
    }
  });
});
