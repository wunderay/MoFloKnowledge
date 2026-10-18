// Helpers for driving the Site Knowledge "+ Add page" dialog through the interactive runtime
// (tests/helpers/knowledge-view-site-all-runtime.tsx). They find things by role, accessible name and
// visible text, never by class names. Fields must be controlled inputs (value + onChange): the fake DOM
// has no FormData, so an uncontrolled input cannot be read by a test.
import { expect } from "vitest";
import { isHidden, roleOf, type FakeNode, type HNode, type View } from "./knowledge-view-site-all-runtime";
import { siteCard, siteCardText } from "./knowledge-view-site-all-dom";
import { COMPANY_ID, siteDraft, type Link } from "./knowledge-view-site-all-fixtures";

export { COMPANY_ID };
export const ADD_PAGE = /^\+\s*add page$/i;

/** Messages must be human: no error codes, schema paths or JavaScript leftovers. */
export const RAW = /invalid_|too_big|too_small|zod|\[object|\bundefined\b|\bnull\b|\bNaN\b|\bcode\b|\bTypeError\b|\bat \w+\.\w+/i;

export const addButtons = (view: View) => view.byRole("button", ADD_PAGE);
export function addButton(view: View): HNode {
  const buttons = addButtons(view);
  expect(buttons, 'one "+ Add page" button').toHaveLength(1);
  return buttons[0];
}

/** Open, visible dialogs (a native <dialog> counts only while open). */
export function openDialogs(view: View): HNode[] {
  return view.all().filter((n) => {
    if (roleOf(n) !== "dialog" || isHidden(n)) {
      return false;
    }
    if (/^field evidence$/i.test(view.nameOf(n))) {
      return false;
    }
    if (n.tag === "dialog") {
      return n.props.open === true || n.props.open === "" || view.app.fakes.get(n.path)?.node.open === true;
    }
    return true;
  });
}
export const theDialog = (view: View): HNode | undefined => openDialogs(view)[0];

export async function openAdd(view: View): Promise<HNode> {
  await view.click(addButton(view));
  await view.settle();
  const dialogs = openDialogs(view);
  expect(dialogs, '"+ Add page" opens exactly one dialog').toHaveLength(1);
  return dialogs[0];
}

export const urlField = (view: View, dialog: HNode): HNode | undefined => view.byRole("textbox", /page url/i, dialog)[0];
export const titleField = (view: View, dialog: HNode): HNode | undefined => view.byRole("textbox", /^title/i, dialog)[0];
export const saveButton = (view: View, dialog: HNode): HNode | undefined => view.byRole("button", /^save/i, dialog)[0];
export const cancelButton = (view: View, dialog: HNode): HNode | undefined => view.byRole("button", /^cancel$/i, dialog)[0];
export const valueOf = (view: View, node: HNode | undefined): string => String(node ? (view.fresh(node)?.props.value ?? "") : "<missing>");

export async function typeInto(view: View, field: HNode | undefined, text: string): Promise<void> {
  expect(field, "the field exists").toBeDefined();
  const n = view.fresh(field!)!;
  const target = { tagName: n.tag.toUpperCase(), type: "text", value: text, name: n.props.name, id: n.props.id };
  expect(typeof n.props.onChange, "a controlled input with onChange").toBe("function");
  n.props.onChange({ type: "change", target, currentTarget: target, preventDefault() {}, stopPropagation() {}, persist() {}, nativeEvent: {} });
  view.app.flushSync();
}
/** Type the address (and optionally the title) into the open dialog. */
export async function fill(view: View, url: string, title?: string): Promise<HNode> {
  const dialog = theDialog(view)!;
  expect(dialog, "the add-page dialog is open").toBeDefined();
  await typeInto(view, urlField(view, dialog), url);
  if (title !== undefined) {
    await typeInto(view, titleField(view, dialog), title);
  }
  return dialog;
}
/** Click Save and let the request finish. */
export async function save(view: View): Promise<boolean> {
  const dialog = theDialog(view);
  expect(dialog, "the add-page dialog is open").toBeDefined();
  const button = saveButton(view, dialog!);
  expect(button, 'a "Save" button').toBeDefined();
  const fired = await view.click(button!);
  await view.settle();
  return fired;
}
/** Open the dialog, type, Save. */
export async function addPage(view: View, url: string, title?: string): Promise<void> {
  await openAdd(view);
  await fill(view, url, title);
  await save(view);
}

/** Enter pressed in the address field, the way a browser handles it: keydown handlers first, then implicit form submission. */
export async function pressEnterInUrl(view: View): Promise<void> {
  const dialog = theDialog(view)!;
  const field = view.fresh(urlField(view, dialog)!)!;
  const event: any = {
    type: "keydown", key: "Enter", code: "Enter", target: { tagName: "INPUT", value: field.props.value }, defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, persist() {}, nativeEvent: {},
  };
  event.currentTarget = event.target;
  for (let node: HNode | null = field; node; node = node.parent) {
    if (typeof node.props.onKeyDown === "function") {
      node.props.onKeyDown(event);
      if (event.propagationStopped) {
        break;
      }
    }
  }
  if (!event.defaultPrevented) {
    let form: HNode | null = field.parent;
    while (form && !(form.tag === "form" && typeof form.props.onSubmit === "function")) {
      form = form.parent;
    }
    if (form) {
      form.props.onSubmit({ ...event, type: "submit", target: form, currentTarget: form });
    }
  }
  view.app.flushSync();
  await view.settle();
}

export function alertText(view: View, dialog: HNode): string {
  return view.byRole("alert", undefined, dialog).map((n) => view.text(n)).join(" ").trim();
}
export const cardText = (view: View) => {
  const page = view.page();
  return siteCardText(page, siteCard(page)!);
};

/** The draft with the company's website changed (company profile field and company row agree); `null` clears the profile field. */
export function withWebsite(website: string | null, links: Link[] | null | undefined = undefined) {
  const draft = siteDraft(links === undefined ? {} : { links });
  const foundation = draft.entries.find((e) => e.kind === "company_foundation") as any;
  foundation.content.website = website;
  if (website) {
    (draft.company as any).website_url = website;
  }
  return draft;
}

/** Focus handed back to "+ Add page" after the dialog closed: the button was focused, or a native modal <dialog> was closed (the browser restores focus itself). */
export interface FocusProbe { button: number; meta?: FakeNode; closes: number }
export function probeFocus(view: View, dialog: HNode): FocusProbe {
  const meta = dialog.tag === "dialog" ? view.fakeOf(dialog) : undefined;
  return { button: view.fakeOf(addButton(view))?.focusCalls ?? 0, meta, closes: meta?.closeCalls ?? 0 };
}
export function focusReturned(view: View, before: FocusProbe): boolean {
  if ((view.fakeOf(addButton(view))?.focusCalls ?? 0) > before.button) {
    return true;
  }
  return !!before.meta && before.meta.closeCalls > before.closes;
}
