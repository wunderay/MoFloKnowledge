// Multi-line fields of /knowledge/view edit in place.
//
// Fields: Overview and Founding story (General Info), Business model (Customers & Industry), Pitch (Sales & Marketing).
//  - the value is a button named "Edit <Field>" (title "Click to edit", pencil); it opens a <textarea> of 3 rows,
//    labelled with the field name, focused, caret at the end, with a "Save" and a "Cancel" button.
//  - Save is disabled until the trimmed text differs from the saved one.
//  - Enter saves (and the page prevents the newline); Shift+Enter inserts a newline and saves nothing.
//  - the text is trimmed, inner line breaks are kept; Cancel and Escape restore the saved value and send nothing.
import { describe, expect, it, vi } from "vitest";
import {
  AREA_FIELDS,
  alertText,
  buttonNamed,
  click,
  draftWith,
  editButton,
  editButtons,
  focusedIs,
  hasPencil,
  key,
  nothingSent,
  open,
  revisionWrite,
  startEdit,
  statusText,
  stored,
  textboxes,
  type,
  valueOf,
  disabled,
  withField,
  getAt,
} from "../helpers/knowledge-view-inline-edit";
import { buildBusiness } from "../helpers/knowledge-view-fixtures";

vi.setConfig({ testTimeout: 60_000 });

const originalOf = (field: (typeof AREA_FIELDS)[number]) =>
  String(getAt(buildBusiness()[field.kind === "positioning" ? "positioning" : "company_foundation"], field.path));

describe.each(AREA_FIELDS)("textarea field: $label", (field) => {
  const original = () => originalOf(field);
  const saveButton = (view: Awaited<ReturnType<typeof open>>) => buttonNamed(view, /^save\b/i);
  const cancelButton = (view: Awaited<ReturnType<typeof open>>) => buttonNamed(view, /^cancel\b/i);

  it("shows the text as a button named 'Edit <Field>' with title 'Click to edit' and a pencil", async () => {
    const view = await open(field.section);
    const button = editButton(view, field.label);
    expect(view.text(button)).toContain(original());
    expect(button.props.title).toBe("Click to edit");
    expect(hasPencil(button)).toBe(true);
    expect(textboxes(view, field.label)).toHaveLength(0);
    nothingSent(view);
  });

  it("opens a labelled 3-row textarea holding the text, focused, caret at the end, with Save (disabled) and Cancel", async () => {
    const view = await open(field.section);
    const area = await startEdit(view, field);
    expect(area.tag, "a multi-line control").toBe("textarea");
    expect(Number(area.props.rows), "three rows").toBe(3);
    expect(valueOf(view, area)).toBe(original());
    expect(view.focusMovedInto(area) || focusedIs(area), "focus moved into the textarea").toBe(true);
    expect(view.fakeOf(area)?.selection, "caret placed at the end").toEqual([original().length, original().length]);
    expect(saveButton(view), 'a "Save" button').toBeDefined();
    expect(cancelButton(view), 'a "Cancel" button').toBeDefined();
    expect(disabled(view, saveButton(view)), "Save is disabled until something changed").toBe(true);
    nothingSent(view);
  });

  it("Save becomes enabled when the text changes and is disabled again when it is changed back", async () => {
    const view = await open(field.section);
    const area = await startEdit(view, field);
    await type(view, area, `${original()} And more.`);
    expect(disabled(view, saveButton(view))).toBe(false);
    await type(view, area, original());
    expect(disabled(view, saveButton(view))).toBe(true);
    await type(view, area, `  ${original()} \n\n `);
    expect(disabled(view, saveButton(view)), "extra white space is not a change").toBe(true);
    await click(view, saveButton(view));
    nothingSent(view, "a disabled Save sends nothing");
  });

  it("the Save button saves one revision with only this field changed, with Saving… then '✓ Saved'", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    view.server.hold();
    const area = await startEdit(view, field);
    await type(view, area, "A rewritten paragraph.");
    await click(view, saveButton(view));
    expect(statusText(view)).toMatch(/saving/i);
    const again = buttonNamed(view, /^save\b/i);
    if (again) {
      await view.click(again);
    }
    view.server.release();
    await view.settle();
    expect(statusText(view)).toMatch(/✓\s*Saved/);
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, field.path, "A rewritten paragraph."));
    expect(view.server.writes, "one request even if Save is pressed twice").toHaveLength(1);
    expect(view.text(editButton(view, field.label))).toContain("A rewritten paragraph.");
    expect(textboxes(view, field.label), "the editor closes after a save").toHaveLength(0);
    expect(alertText(view)).toBe("");
  });

  it("Enter saves, and the page keeps the browser from inserting a newline", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    const area = await startEdit(view, field);
    await type(view, area, "Saved with Enter");
    const { prevented } = await key(view, area, "Enter");
    expect(prevented, "Enter is not typed into the text").toBe(true);
    await view.settle();
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, field.path, "Saved with Enter"));
  });

  it("Shift+Enter inserts a newline: the browser's default is kept and nothing is saved", async () => {
    const view = await open(field.section);
    const area = await startEdit(view, field);
    await type(view, area, "First line\n");
    const { prevented } = await key(view, area, "Enter", { shift: true });
    expect(prevented, "Shift+Enter is left to the browser").toBe(false);
    await view.settle();
    nothingSent(view, "Shift+Enter saves nothing");
    expect(textboxes(view, field.label), "the editor stays open").toHaveLength(1);
  });

  it("trims the text, keeps the line breaks inside it", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    const area = await startEdit(view, field);
    await type(view, area, "\n  Line one\nLine two  \n\n");
    await click(view, saveButton(view));
    const { content } = revisionWrite(view, before);
    expect(getAt(content, field.path)).toBe("Line one\nLine two");
  });

  it("Cancel closes the editor, restores the saved text and sends nothing; so does Escape", async () => {
    const view = await open(field.section);
    let area = await startEdit(view, field);
    await type(view, area, "Never saved");
    await click(view, cancelButton(view));
    expect(textboxes(view, field.label)).toHaveLength(0);
    expect(view.text(editButton(view, field.label))).toContain(original());
    expect(view.text()).not.toContain("Never saved");
    expect(focusedIs(editButton(view, field.label)), "focus returns to the button").toBe(true);

    area = await startEdit(view, field);
    expect(valueOf(view, area), "reopening shows the saved text, not the abandoned one").toBe(original());
    await type(view, area, "Also never saved");
    await key(view, area, "Escape");
    expect(textboxes(view, field.label)).toHaveLength(0);
    expect(view.text()).not.toContain("Also never saved");
    nothingSent(view, "cancelling sends nothing");
  });

  it("clearing the text saves null", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    const area = await startEdit(view, field);
    await type(view, area, "");
    expect(disabled(view, saveButton(view)), "emptying a filled field is a change").toBe(false);
    await click(view, saveButton(view));
    const { content } = revisionWrite(view, before);
    expect(getAt(content, field.path)).toBeNull();
  });

  it("an empty field has an 'Edit <Field>' button and typing a value saves it", async () => {
    const draft = draftWith((b) => {
      (field.kind === "positioning" ? (b.positioning as any) : (b.company_foundation as any))[field.path[0]] = null;
    });
    const view = await open(field.section, { draft });
    const before = stored(view, field.kind);
    expect(editButtons(view, field.label)).toHaveLength(1);
    const area = await startEdit(view, field);
    expect(valueOf(view, area)).toBe("");
    expect(disabled(view, saveButton(view)), "Save waits for a change").toBe(true);
    await type(view, area, "Written from the view");
    await key(view, area, "Enter");
    await view.settle();
    const { content } = revisionWrite(view, before);
    expect(getAt(content, field.path)).toBe("Written from the view");
  });
});
