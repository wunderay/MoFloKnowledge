// Single-line fields of /knowledge/view edit in place.
//
// Public contract (roles, names, requests; no class names, no structure):
//  - an editable draft shows the value as a button named "Edit <Field>" with title="Click to edit" and a pencil
//    (an aria-hidden svg); clicking it, or Enter / Space on it, opens a text field labelled with the field name,
//    focused, with the caret at the end of the text.
//  - Enter or blur saves ONE revision (nothing when the text is unchanged); Escape cancels and restores the value.
//  - while the request runs a role=status element says "Saving…"; afterwards role=status says "✓ Saved".
//  - fields: Legal entity (General Info), Industry (Customers & Industry); Founded and Employees are in the
//    validation file because they have contract rules of their own.
// Emptying a field and saving it stores null (the contract's "no value"); it is not an error.
// The value is trimmed before it is compared and saved.
import { describe, expect, it, vi } from "vitest";
import {
  INDUSTRY,
  LEGAL,
  SINGLE_FIELDS,
  alertText,
  blur,
  buttonNamed,
  draftWith,
  editButton,
  editButtons,
  editAndEnter,
  focusedIs,
  hasPencil,
  key,
  nothingSent,
  open,
  revisionWrite,
  startEdit,
  staleBlur,
  statusText,
  statuses,
  stored,
  textboxes,
  type,
  valueOf,
  withField,
} from "../helpers/knowledge-view-inline-edit";
import { buildBusiness } from "../helpers/knowledge-view-fixtures";

vi.setConfig({ testTimeout: 60_000 });

describe.each(SINGLE_FIELDS)("single-line field: $label", (field) => {
  const original = () => String(buildBusiness().company_foundation[field.path[0] as "industry" | "legal_entity_type"]);

  it("shows the value as a button named 'Edit <Field>' with title 'Click to edit' and a pencil, and no text field", async () => {
    const view = await open(field.section);
    const button = editButton(view, field.label);
    expect(view.text(button), "the button still shows the value").toContain(original());
    expect(button.props.title).toBe("Click to edit");
    expect(hasPencil(button), "a pencil icon (aria-hidden svg) inside the button").toBe(true);
    expect(textboxes(view, field.label), "no text field while closed").toHaveLength(0);
    nothingSent(view, "opening the page sends no write");
  });

  it("a click opens a labelled text field holding the value, focused, caret at the end", async () => {
    const view = await open(field.section);
    const input = await startEdit(view, field);
    expect(input.tag, "a single-line control").toBe("input");
    expect(valueOf(view, input)).toBe(original());
    expect(editButtons(view, field.label), "the button gives way to the field").toHaveLength(0);
    expect(view.focusMovedInto(input) || focusedIs(input), "focus moved into the field").toBe(true);
    const selection = view.fakeOf(input)?.selection;
    expect(selection, "the caret was placed explicitly (setSelectionRange / selectionStart)").not.toBeNull();
    expect(selection, "caret at the end, nothing selected").toEqual([original().length, original().length]);
    nothingSent(view, "opening the editor sends nothing");
  });

  it("Enter saves one revision with only this field changed, shows Saving… then '✓ Saved', and shows the new value", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    view.server.hold();
    const input = await startEdit(view, field);
    await type(view, input, "Brand new value");
    await key(view, input, "Enter");
    expect(statusText(view), "a status says it is saving while the request runs").toMatch(/saving/i);
    expect(view.server.writes, "one request in flight").toHaveLength(1);
    view.server.release();
    await view.settle();
    expect(statusText(view)).toMatch(/✓\s*Saved/);
    expect(statuses(view).length).toBeGreaterThan(0);
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, field.path, "Brand new value"));
    expect(view.server.writes, "exactly one write").toHaveLength(1);
    expect(view.text(editButton(view, field.label)), "the saved value is shown").toContain("Brand new value");
    expect(alertText(view)).toBe("");
  });

  it("blur saves the same way", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    const input = await startEdit(view, field);
    await type(view, input, "Typed then blurred");
    await blur(view, input);
    await view.settle();
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, field.path, "Typed then blurred"));
    expect(statusText(view)).toMatch(/✓\s*Saved/);
  });

  it("the text is trimmed before it is saved", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    await editAndEnter(view, field, "   Padded value \t ");
    const { content } = revisionWrite(view, before);
    expect(getValue(content, field.path)).toBe("Padded value");
  });

  it("Escape cancels: nothing is sent, the old value is back, and the blur of the removed field saves nothing", async () => {
    const view = await open(field.section);
    const input = await startEdit(view, field);
    await type(view, input, "Abandoned change");
    const last = view.fresh(input)!;
    await key(view, input, "Escape");
    expect(textboxes(view, field.label), "the field is gone").toHaveLength(0);
    const button = editButton(view, field.label);
    expect(view.text(button)).toContain(original());
    expect(view.text(button)).not.toContain("Abandoned change");
    expect(focusedIs(button), "focus returns to the button").toBe(true);
    await staleBlur(view, last);
    nothingSent(view, "Escape and the blur that follows send nothing");
  });

  it("an unchanged value sends nothing on Enter or on blur, and closes", async () => {
    const view = await open(field.section);
    let input = await startEdit(view, field);
    await key(view, input, "Enter");
    await view.settle();
    expect(textboxes(view, field.label), "Enter closes the unchanged field").toHaveLength(0);
    input = await startEdit(view, field);
    await type(view, input, original());
    await blur(view, input);
    await view.settle();
    expect(textboxes(view, field.label), "blur closes the unchanged field").toHaveLength(0);
    // the same text with extra spaces is still unchanged
    input = await startEdit(view, field);
    await type(view, input, `  ${original()}  `);
    await key(view, input, "Enter");
    await view.settle();
    nothingSent(view, "no request for an unchanged value");
    expect(statusText(view), "no 'Saved' for a save that did not happen").not.toMatch(/saved/i);
  });

  it("Enter followed by the blur of the closing field, or a second Enter while saving, sends one request", async () => {
    const view = await open(field.section);
    view.server.hold();
    const input = await startEdit(view, field);
    await type(view, input, "Only once");
    const last = view.fresh(input)!;
    await key(view, input, "Enter");
    await key(view, input, "Enter");
    await staleBlur(view, last);
    view.server.release();
    await view.settle();
    await staleBlur(view, last);
    expect(view.server.writes, "one write").toHaveLength(1);
  });

  it("clearing the text saves null (the field is empty again)", async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    await editAndEnter(view, field, "   ");
    const { content } = revisionWrite(view, before);
    expect(getValue(content, field.path)).toBeNull();
    expect(content).toEqual(withField(before, field.path, null));
  });

  it("an empty field still has an 'Edit <Field>' button, and typing a value saves it", async () => {
    const draft = draftWith((b) => {
      (b.company_foundation as any)[field.path[0]] = null;
    });
    const view = await open(field.section, { draft });
    const before = stored(view, field.kind);
    expect(editButtons(view, field.label), "an empty value can be added in place").toHaveLength(1);
    await editAndEnter(view, field, "Added from the view");
    const { content } = revisionWrite(view, before);
    expect(content).toEqual(withField(before, field.path, "Added from the view"));
  });

  it("an empty field that stays empty sends nothing", async () => {
    const draft = draftWith((b) => {
      (b.company_foundation as any)[field.path[0]] = null;
    });
    const view = await open(field.section, { draft });
    const input = await startEdit(view, field);
    await type(view, input, "  ");
    await blur(view, input);
    await view.settle();
    nothingSent(view);
  });
});

const getValue = (content: any, path: string[]) => path.reduce((v, k) => v?.[k], content);

describe("single-line fields are independent", () => {
  it("editing Legal entity leaves the other values of the section as they were", async () => {
    const view = await open(LEGAL.section);
    const before = stored(view, LEGAL.kind);
    await editAndEnter(view, LEGAL, "Public Benefit Corporation");
    const { content } = revisionWrite(view, before);
    expect(content.overview).toBe(before.content.overview);
    expect(content.main_address).toEqual((before.content).main_address);
    expect(content.alternative_company_names).toEqual((before.content).alternative_company_names);
    expect(buttonNamed(view, "Edit Overview"), "other fields remain editable").toBeDefined();
  });

  it("the Industry banner shows the new industry as its heading text after a save", async () => {
    const view = await open(INDUSTRY.section);
    await editAndEnter(view, INDUSTRY, "Craft beverage roasting");
    expect(view.text()).toContain("Craft beverage roasting");
    expect(view.text()).not.toContain("Specialty coffee roasting and retail");
  });

  it("an empty Industry is editable in place and the banner does not break", async () => {
    const draft = draftWith((b) => {
      b.company_foundation.industry = null;
    });
    const view = await open(INDUSTRY.section, { draft });
    expect(editButtons(view, INDUSTRY.label)).toHaveLength(1);
    expect(view.text()).not.toMatch(/undefined|NaN|\[object|\bnull\b/);
  });
});
