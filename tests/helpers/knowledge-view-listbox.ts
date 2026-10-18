// Shared by the navigation-listbox tests: the section order and
// identifiers, plus queries/drivers over the interactive runtime of
// knowledge-view-site-all-runtime (which can click, press keys and record navigation).
// Import this helper OR knowledge-view-render, never both in one test file.
import { expect } from "vitest";
import {
  descendants,
  ancestorsOf,
  focusedPath,
  focusPath,
  navigations,
  openView,
  roleOf,
  type HNode,
  type OpenOptions,
  type View,
} from "./knowledge-view-site-all-runtime";
import { norm } from "./knowledge-view-dom";

/** The reference order of the listbox with the URL identifier of each section. */
export const LISTBOX_SECTIONS = [
  { id: "general", label: "General Info" },
  { id: "brand", label: "Brand Identity" },
  { id: "offerings", label: "Business Offerings" },
  { id: "customers", label: "Customers & Industry" },
  { id: "sales", label: "Sales & Marketing" },
  { id: "key-people", label: "Key People" },
  { id: "site", label: "Site Knowledge" },
  { id: "all", label: "All sections" },
] as const;
export const LABELS = LISTBOX_SECTIONS.map((s) => s.label);
export type Entry = (typeof LISTBOX_SECTIONS)[number];

export const NAME = /^knowledge section/i;
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

/** Open /knowledge/view with the client URL fully populated (companyId, versionId, section). */
export const openListboxView = (opts: Omit<OpenOptions, "fullUrl" | "rawSection"> & { raw?: string; extra?: Record<string, string> }) =>
  openView({ ...opts, rawSection: opts.raw, fullUrl: { extra: opts.extra } });

/** Fail with an AssertionError (never a TypeError) when a lookup comes back empty. */
export function need<T>(value: T | undefined | null, what: string): T {
  expect(value, what).toBeTruthy();
  return value as T;
}

/** The button that opens the section listbox. */
export function trigger(view: View): HNode {
  const candidates = view.byRole("button").filter((b) => NAME.test(view.nameOf(b)));
  expect(candidates.length, 'one button whose accessible name starts with "Knowledge section"').toBe(1);
  return candidates[0];
}
export const freshTrigger = (view: View) => trigger(view);
export const listboxes = (view: View) => view.byRole("listbox");
export const options = (view: View): HNode[] => {
  const lb = listboxes(view)[0];
  return lb ? view.byRole("option", undefined, lb) : [];
};
export const optionLabels = (view: View) => options(view).map((o) => view.nameOf(o));
export const isExpanded = (view: View) => str(trigger(view).props["aria-expanded"]);

export async function open(view: View): Promise<void> {
  const t = trigger(view);
  focusPath(t.path); // a browser focuses a button when it is clicked
  await view.click(t);
  await view.settle(3);
  expect(str(trigger(view).props["aria-expanded"]), "clicking the trigger opens the listbox").toBe("true");
}

const focusedNode = (view: View): HNode | null => {
  const path = focusedPath();
  return (path && view.all().find((n) => n.path === path)) || null;
};

/**
 * The option the user is on: the focused option (roving focus) or the one named by
 * aria-activedescendant on the focused element (trigger or listbox).
 */
export function activeOption(view: View): HNode | null {
  const focus = focusedNode(view) ?? trigger(view);
  if (roleOf(focus) === "option") {
    return focus;
  }
  const id = str(focus.props["aria-activedescendant"]);
  return id ? options(view).find((o) => str(o.props.id) === id) ?? null : null;
}
export const activeLabel = (view: View) => {
  const o = activeOption(view);
  return o ? view.nameOf(o) : null;
};

type KeyEvent = Record<string, any>;
const keyEvent = (key: string, target: HNode): KeyEvent => ({
  type: "keydown",
  key,
  code: key === " " ? "Space" : key,
  target: { tagName: target.tag.toUpperCase(), id: target.props.id },
  defaultPrevented: false,
  propagationStopped: false,
  preventDefault() { this.defaultPrevented = true; },
  stopPropagation() { this.propagationStopped = true; },
  persist() {},
  nativeEvent: {},
});

/** Press a key where focus is (the focused element, else the trigger): React handlers bubble, then document listeners. */
export async function press(view: View, key: string): Promise<{ prevented: boolean }> {
  const target = focusedNode(view) ?? trigger(view);
  const event = keyEvent(key, target);
  for (let node: HNode | null = target; node; node = node.parent) {
    const handler = node.props.onKeyDown;
    if (typeof handler === "function") {
      handler({ ...event, currentTarget: { tagName: node.tag.toUpperCase(), id: node.props.id } });
      if (event.propagationStopped) {
        break;
      }
    }
  }
  if (!event.propagationStopped) {
    for (const fn of view.app.documentListeners.get("keydown") ?? []) {
      fn(keyEvent(key, target));
    }
  }
  view.app.flushSync();
  await view.settle(3);
  return { prevented: event.defaultPrevented };
}

/** A pointer press/click on something that is not part of the control (the page heading). */
export async function clickOutside(view: View): Promise<void> {
  const outside = need(view.byRole("heading").find((h) => h.tag === "h1") ?? view.byRole("heading")[0], "a heading outside the control");
  const fake = view.app.fakeFor(outside).node;
  for (const type of ["pointerdown", "mousedown", "touchstart", "mouseup", "pointerup", "click", "focusin"]) {
    for (const fn of view.app.documentListeners.get(type) ?? []) {
      fn({ type, target: fake, currentTarget: fake, composedPath: () => [fake], preventDefault() {}, stopPropagation() {}, persist() {} });
    }
  }
  view.app.flushSync();
  await view.settle(3);
}

/** The URL the UI navigated to (router call, history call, or the link that was activated), against the page's own URL. */
export function navigatedTo(view: View, activated?: HNode, base = "http://localhost/knowledge/view"): URL | null {
  const calls = navigations();
  let target = calls[calls.length - 1];
  if (target === undefined && activated) {
    const fresh = view.fresh(activated) ?? activated;
    const link = [fresh, ...ancestorsOf(fresh), ...descendants(fresh)].find((n) => n.tag === "a" && typeof n.props.href === "string");
    target = link?.props.href;
  }
  return target === undefined ? null : new URL(target, base);
}

export async function chooseByClick(view: View, label: string): Promise<{ option: HNode; url: URL | null }> {
  const option = need(options(view).find((o) => view.nameOf(o) === label), `an option "${label}"`);
  await view.click(option);
  await view.settle(3);
  return { option, url: navigatedTo(view, option) };
}

/** Elements that can carry the open/closed state hook: the trigger, its ancestors up to (excluding) the page region, the listbox. */
export function stateHooks(view: View): string[] {
  const t = trigger(view);
  const out: HNode[] = [t];
  for (const a of ancestorsOf(t)) {
    if (a.tag === "#root" || descendants(a).some((d) => roleOf(d) === "heading")) {
      break;
    }
    out.push(a);
  }
  const lb = view.all().find((n) => roleOf(n) === "listbox");
  if (lb) {
    out.push(lb);
  }
  return out.map((n) => str(n.props["data-state"])).filter((v): v is string => v !== undefined);
}
export { norm };
