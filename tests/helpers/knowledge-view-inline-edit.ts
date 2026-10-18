// Helpers for the inline-editing acceptance tests (Quest Q7 inline-edit-core).
//
// Everything here works on public output only: the roles and accessible names of the rendered
// elements, the events a browser would deliver (typing, keys, blur, click), and the HTTP requests the
// UI sends to the (fake) company API. Import this helper before any component module: it loads the
// interactive runtime, which replaces "react" hooks and next/* modules.
import { expect } from "vitest";
import {
  EntryProvenanceSchema,
  createEmptyBusiness,
  entryBusiness,
  parseBusinessEntry,
  validateProvenance,
  type Business,
  type EntryKind,
} from "../../src/contracts";
import { CreateEntrySchema, SaveEntrySchema } from "../../src/contracts/api-entries";
import type {
  FakeServer} from "./knowledge-view-site-all-runtime";
import {
  ancestorsOf,
  descendants,
  focusedPath,
  openView,
  roleOf,
  type HNode,
  type OpenOptions,
  type SectionLabel,
  type View,
} from "./knowledge-view-site-all-runtime";
import { ACTOR, COMPANY_ID, buildBusiness, buildDraft, draftFrom, type Draft } from "./knowledge-view-fixtures";

export { ACTOR, COMPANY_ID };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REVISIONS = (entryId: string, companyId = COMPANY_ID) => `/api/companies/${companyId}/entries/${entryId}/revisions`;
export const ENTRIES = (companyId = COMPANY_ID) => `/api/companies/${companyId}/entries`;

// ---- the fields under test -----------------------------------------------------------------------------------
interface Where { section: SectionLabel; label: string; kind: EntryKind; path: string[] }
export type TextField = Where & { id: string; shape: "single" | "area" };
export type ChipField = Where & { id: string; noun: string };

const FOUNDATION: EntryKind = "company_foundation";
const POSITIONING: EntryKind = "positioning";
const MARKET: EntryKind = "market_and_customers";

export const LEGAL: TextField = { id: "legal", shape: "single", section: "General Info", label: "Legal entity", kind: FOUNDATION, path: ["legal_entity_type"] };
export const INDUSTRY: TextField = { id: "industry", shape: "single", section: "Customers & Industry", label: "Industry", kind: FOUNDATION, path: ["industry"] };
export const OVERVIEW_F: TextField = { id: "overview", shape: "area", section: "General Info", label: "Overview", kind: FOUNDATION, path: ["overview"] };
export const STORY: TextField = { id: "story", shape: "area", section: "General Info", label: "Founding story", kind: POSITIONING, path: ["founding_story"] };
export const MODEL: TextField = { id: "model", shape: "area", section: "Customers & Industry", label: "Business model", kind: FOUNDATION, path: ["business_model"] };
export const PITCH_F: TextField = { id: "pitch", shape: "area", section: "Sales & Marketing", label: "Pitch", kind: POSITIONING, path: ["company_pitch"] };
export const SINGLE_FIELDS = [LEGAL, INDUSTRY];
export const AREA_FIELDS = [OVERVIEW_F, STORY, MODEL, PITCH_F];
export const TEXT_FIELDS = [...SINGLE_FIELDS, ...AREA_FIELDS];
/** Founded (a four-digit year) and Employees (a count) are single-line fields with their own rules. */
export const FOUNDED = { section: "General Info" as SectionLabel, label: "Founded", kind: FOUNDATION };
export const EMPLOYEES = { section: "General Info" as SectionLabel, label: "Employees", kind: FOUNDATION };

export const NAMES: ChipField = { id: "names", section: "General Info", label: "Alternate names", noun: "alternate name", kind: FOUNDATION, path: ["alternative_company_names"] };
export const ROLES: ChipField = { id: "roles", section: "Customers & Industry", label: "Company role", noun: "company role", kind: FOUNDATION, path: ["company_role"] };
export const GROUPINGS: ChipField = { id: "groupings", section: "Customers & Industry", label: "Industry groupings", noun: "industry grouping", kind: MARKET, path: ["industry_groupings"] };
export const LOCATIONS: ChipField = { id: "locations", section: "Customers & Industry", label: "Service locations", noun: "service location", kind: FOUNDATION, path: ["service_locations"] };
export const BUYERS: ChipField = { id: "buyers", section: "Customers & Industry", label: "Buyers", noun: "buyer", kind: MARKET, path: ["target_buyers"] };
export const NEEDS: ChipField = { id: "needs", section: "Sales & Marketing", label: "Customer needs", noun: "customer need", kind: MARKET, path: ["customer_needs"] };
export const CHIP_FIELDS = [NAMES, ROLES, GROUPINGS, LOCATIONS, BUYERS, NEEDS];

export const getAt = (value: any, path: string[]) => path.reduce((v, key) => v?.[key], value);
export function setAt(value: any, path: string[], next: unknown) {
  const parent = getAt(value, path.slice(0, -1));
  parent[path[path.length - 1]] = next;
  return value;
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const named = (label: string) => new RegExp(`\\b${escape(label)}\\b`, "i");

// ---- fixtures ------------------------------------------------------------------------------------------------------
export function draftWith(change: (business: Business) => void, opts: { role?: "owner" | "viewer" } = {}): Draft {
  const business = buildBusiness();
  change(business);
  return draftFrom(business, opts);
}
export const emptyFields = () => createEmptyBusiness();
export const entryOf = (draft: Draft, kind: EntryKind) => draft.entries.find((entry) => entry.kind === kind)!;

export async function open(section: SectionLabel, opts: Omit<OpenOptions, "section"> = {}): Promise<View> {
  return openView({ section, draft: opts.snapshot ? undefined : buildDraft(), ...opts });
}
/** The stored entry of a kind in the fake API right now (copied, so a later write cannot change it). */
export const stored = (view: View, kind: EntryKind): Entry => structuredClone(entryOf(view.server.draft as Draft, kind)) as Entry;

// ---- finding things ------------------------------------------------------------------------------------------------
export function one<T>(found: T[], what: string): T {
  expect(found, what).toHaveLength(1);
  return found[0];
}
export function must<T>(value: T | undefined | null, what: string): T {
  expect(value, what).toBeTruthy();
  return value as T;
}
export const editButtons = (view: View, label: string) => view.byRole("button", `Edit ${label}`);
export const editButton = (view: View, label: string) => one(editButtons(view, label), `exactly one button named "Edit ${label}"`);
export const textboxes = (view: View, label: string) => view.byRole("textbox", named(label));
export const textbox = (view: View, label: string) => one(textboxes(view, label), `exactly one text field labelled "${label}"`);
/** Text controls a person can type into (hidden form fields, such as the export form's, are not). */
export const typable = (view: View) => view.byRole("textbox").filter((n) => String(n.props.type ?? "text") !== "hidden");
export const buttonNamed = (view: View, name: string | RegExp) => view.byRole("button", name)[0];
export const statuses = (view: View) => view.byRole("status");
export const alerts = (view: View) => view.byRole("alert");
/** All text under a node, including text the accessibility tree hides (an icon glyph such as the check mark). */
export function rawText(node: HNode | string): string {
  if (typeof node === "string") {
    return node;
  }
  return node.children.map(rawText).join(" ").replace(/\s+/g, " ").trim();
}
export const statusText = (view: View) => statuses(view).map(rawText).join(" | ");
export const alertText = (view: View) => alerts(view).map(rawText).join(" | ");
export const hasPencil = (button: HNode) => descendants(button).some((n) => n.tag === "svg" && (n.props["aria-hidden"] === true || n.props["aria-hidden"] === "true"));
export const disabled = (view: View, node: HNode) => {
  const now = view.fresh(node) ?? node;
  return view.isDisabled(now) || now.props["aria-disabled"] === true || now.props["aria-disabled"] === "true";
};
export const valueOf = (view: View, node: HNode) => String((view.fresh(node) ?? node).props.value ?? "");
export const pageText = (view: View) => view.text();

// ---- doing things --------------------------------------------------------------------------------------------------
const baseEvent = (type: string, n: HNode, value: string) => {
  const target = { tagName: n.tag.toUpperCase(), value, name: n.props.name, id: n.props.id, type: n.props.type, selectionStart: value.length, selectionEnd: value.length };
  return {
    type,
    target,
    currentTarget: target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    persist() {},
    nativeEvent: { isComposing: false },
  } as any;
};
const live = (view: View, node: HNode) => view.fresh(node) ?? node;

/** Click, as a browser does it. */
export async function click(view: View, node: HNode): Promise<boolean> {
  const fired = await view.click(node);
  await view.settle();
  return fired;
}
/** Replace the text of a text field, firing the change event a browser fires. */
export async function type(view: View, stale: HNode, text: string): Promise<void> {
  const n = live(view, stale);
  const handler = n.props.onChange ?? n.props.onInput;
  expect(handler, `${n.tag} reacts to typing (onChange)`).toBeTypeOf("function");
  const fake = view.app.fakes.get(n.path)?.node;
  if (fake) {
    fake.value = text;
  }
  handler(baseEvent("change", n, text));
  view.app.flushSync();
}
/** A key pressed on a focused element. Returns whether the page prevented the browser's default action. */
export async function key(view: View, stale: HNode, name: string, mods: { shift?: boolean } = {}): Promise<{ prevented: boolean }> {
  const n = live(view, stale);
  const value = String(view.app.fakes.get(n.path)?.node.value ?? n.props.value ?? "");
  const event = baseEvent("keydown", n, value);
  Object.assign(event, { key: name, code: name === " " ? "Space" : name, shiftKey: !!mods.shift, ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false });
  for (let node: HNode | null = n; node; node = node.parent) {
    const handler = node.props.onKeyDown;
    if (typeof handler === "function") {
      event.currentTarget = { ...event.target, tagName: node.tag.toUpperCase() };
      handler(event);
      if (event.propagationStopped) {
        break;
      }
    }
  }
  if (!event.defaultPrevented) {
    // What the browser does with the key when the page did not stop it.
    if (n.tag === "button" && (name === "Enter" || name === " ") && !view.isDisabled(n)) {
      await view.click(n);
    } else if (n.tag === "input" && name === "Enter") {
      const form = ancestorsOf(n).find((a) => a.tag === "form" && typeof a.props.onSubmit === "function");
      if (form) {
        form.props.onSubmit({ ...event, type: "submit", target: form, currentTarget: form });
      }
    }
  }
  view.app.flushSync();
  await view.settle();
  return { prevented: event.defaultPrevented };
}
/** Focus leaves the element. */
export async function blur(view: View, stale: HNode): Promise<void> {
  const n = live(view, stale);
  await fireBlur(view, n);
}
/** The blur a browser fires on an element that was just removed: the handler of the LAST render of that element runs. */
export async function staleBlur(view: View, removed: HNode): Promise<void> {
  await fireBlur(view, removed);
}
async function fireBlur(view: View, n: HNode) {
  const event = baseEvent("blur", n, String(view.app.fakes.get(n.path)?.node.value ?? n.props.value ?? ""));
  event.relatedTarget = null;
  for (let node: HNode | null = n; node; node = node.parent) {
    const handler = node.props.onBlur;
    if (typeof handler === "function") {
      event.currentTarget = { ...event.target, tagName: node.tag.toUpperCase() };
      handler(event);
      if (event.propagationStopped) {
        break;
      }
    }
  }
  view.app.flushSync();
  await view.settle();
}

/** Open the inline editor of a text field and return its text control. */
export async function startEdit(view: View, field: { label: string; section?: SectionLabel }): Promise<HNode> {
  await click(view, editButton(view, field.label));
  return textbox(view, field.label);
}
/** Open, type, press Enter (single-line) and let the request finish. */
export async function editAndEnter(view: View, field: { label: string }, text: string): Promise<HNode> {
  const input = await startEdit(view, field);
  await type(view, input, text);
  await key(view, input, "Enter");
  await view.settle();
  return input;
}

// ---- chips -------------------------------------------------------------------------------------------------------
export const addInputs = (view: View, field: ChipField) => view.byRole("textbox", new RegExp(`^add ${escape(field.noun)}`, "i"));
export const addPill = (view: View, field: ChipField) => view.byRole("button", new RegExp(`^add ${escape(field.noun)}$`, "i"));
/** The add field of a chip list, opening it first if the list shows only its "Add" control. */
export async function chipInput(view: View, field: ChipField): Promise<HNode> {
  if (addInputs(view, field).length === 0) {
    await click(view, one(addPill(view, field), `an "Add ${field.noun}" button`));
  }
  return one(addInputs(view, field), `one "Add ${field.noun}" text field`);
}
export async function addChip(view: View, field: ChipField, text: string): Promise<HNode> {
  const input = await chipInput(view, field);
  await type(view, input, text);
  await key(view, input, "Enter");
  await view.settle();
  return input;
}
export const removeButtons = (view: View, text: string) => view.byRole("button", `Remove ${text}`);
export async function removeChip(view: View, text: string) {
  await click(view, one(removeButtons(view, text), `one button named "Remove ${text}"`));
}
export const undoButtons = (view: View) => view.byRole("button", /^undo\b/i);

// ---- what was sent ---------------------------------------------------------------------------------------------------
export type Entry = Omit<Draft["entries"][number], "content"> & { content: any };
/**
 * The nth revision write, checked against the API's request contract: addressed to the entry, carrying the revision the
 * page was loaded at, a content that satisfies the entry's schema, a request id and a reason.
 */
export function revisionWrite(view: View, before: Entry, nth = 0, expectedRevision = before.current_revision + nth) {
  const writes = view.server.writesTo("revisions");
  const req = must(writes[nth], `revision write #${nth + 1} was sent (sent ${view.server.writes.length} write(s) in total)`);
  expect(req.method).toBe("POST");
  expect(req.path).toBe(REVISIONS(before.id, view.server.draft.company.id));
  const body = SaveEntrySchema.parse(req.body);
  expect(body.expectedRevision, "carries the revision the entry had when the page was loaded").toBe(expectedRevision);
  expect(body.reviewStatus, "a changed value is unreviewed again, as an import is").toBe("unreviewed");
  expect(body.reason?.trim(), "records why the entry changed").toBeTruthy();
  expect(body.requestId).toMatch(UUID);
  const content = parseBusinessEntry(before.kind, body.content);
  return { req, body, content: content as any };
}
export function creationWrite(view: View, kind: EntryKind, nth = 0) {
  const writes = view.server.writesTo("entries");
  const req = must(writes[nth], `creation write #${nth + 1} was sent (sent ${view.server.writes.length} write(s) in total)`);
  expect(req.path).toBe(ENTRIES(view.server.draft.company.id));
  const body = CreateEntrySchema.parse(req.body);
  expect(body.kind).toBe(kind);
  expect(body.requestId).toMatch(UUID);
  const content = parseBusinessEntry(kind, body.content);
  return { req, body, content: content as any };
}
export const nothingSent = (view: View, what = "nothing is sent") => expect(view.server.writes, what).toEqual([]);

/** The content `before` would have with one field replaced. */
export function withField<T>(before: Entry, path: string[], next: unknown): T {
  return setAt(structuredClone(before.content), path, next) as T;
}

/**
 * Runs the real server-side preparation (`prepareRevision`) on a request the UI sent and checks what it would store.
 * The fixtures' entries carry empty provenance (the layout tests assert on values); the stored revision the server
 * reads is therefore given the provenance a manually entered entry has (every populated value claimed), which is
 * what a real entry carries. The browser's own provenance is not trusted by the server and is not used.
 */
export async function serverAcceptsRevision(before: Entry, body: ReturnType<typeof SaveEntrySchema.parse>) {
  const { prepareRevision, prepareManualCreation } = await import("../../src/server/revisions");
  const provenance = prepareManualCreation(before.kind, before.content, before.id, ACTOR);
  const rows: Record<string, unknown> = {
    knowledge_entries: { kind: before.kind, current_revision: before.current_revision },
    knowledge_entry_versions: { content: before.content, provenance },
  };
  const client = {
    from: (table: string) => {
      const query: any = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: rows[table], error: null }) };
      return query;
    },
  };
  const out = await prepareRevision(client as never, COMPANY_ID, before.id, ACTOR, body as never);
  const parsed = EntryProvenanceSchema.safeParse(out.provenance);
  expect(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), "the provenance the server would store fits its contract").toEqual([]);
  expect(validateProvenance(entryBusiness(before.kind, out.content as never), out.provenance), "the stored provenance validates against the stored content").toEqual([]);
  return out;
}
/** Runs the real `prepareManualCreation` on a creation request the UI sent. */
export async function serverAcceptsCreation(body: ReturnType<typeof CreateEntrySchema.parse>) {
  const { prepareManualCreation } = await import("../../src/server/revisions");
  const provenance = prepareManualCreation(body.kind, body.content, body.requestId, ACTOR);
  expect(validateProvenance(entryBusiness(body.kind, body.content), provenance), "the provenance the server would store validates against the content").toEqual([]);
  return provenance;
}

// ---- failures ----------------------------------------------------------------------------------------------------
/** After the first successful write, GET /draft answers 503 until `recover()` is called. */
export function failDraftReadsAfterWrite(server: FakeServer) {
  let written = false;
  let broken = true;
  const original = server.fetch;
  server.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = String(input).split("?")[0];
    if (method === "GET" && path.endsWith("/draft") && written && broken) {
      server.requests.push({ method, path, body: undefined });
      const body = { data: null, error: { code: "unavailable", message: "Draft store is down." }, requestId: "00000000-0000-4000-8000-0000000000aa" };
      return { ok: false, status: 503, json: async () => body, text: async () => JSON.stringify(body) };
    }
    const reply = await original(input, init);
    if (method !== "GET" && reply.ok) {
      written = true;
    }
    return reply;
  }) as typeof server.fetch;
  return { recover: () => void (broken = false) };
}

// ---- a11y and read-only probes ----------------------------------------------------------------------------------
export const isInteractive = (n: HNode) =>
  ["button", "a", "input", "textarea", "select"].includes(n.tag) ||
  roleOf(n) === "button" ||
  n.props.tabIndex !== undefined ||
  typeof n.props.onClick === "function" ||
  n.props.title === "Click to edit";
/** The element that directly holds `text` as its own text (the value as the page shows it). */
export function holderOf(view: View, text: string): HNode | undefined {
  return view.all().find((n) => n.children.some((c) => typeof c === "string" && c.includes(text)));
}
/** True when `text` is shown, and neither its element nor an ancestor is a control. */
export function isPlainText(view: View, text: string): boolean {
  const holder = holderOf(view, text);
  return !!holder && ![holder, ...ancestorsOf(holder)].some(isInteractive);
}
export const focusedIs = (node: HNode) => focusedPath() === node.path;
export const duplicateIds = (view: View) => {
  const seen = new Map<string, number>();
  for (const n of view.all()) {
    if (typeof n.props.id === "string") {
      seen.set(n.props.id, (seen.get(n.props.id) ?? 0) + 1);
    }
  }
  return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
};
export const thisYear = () => new Date().getUTCFullYear();
export const long = (n: number) => "x".repeat(n);

/** Distinct text items with valid ids, for lists at their size limit. */
export const manyItems = (count: number, prefix = "Item") =>
  Array.from({ length: count }, (_, i) => ({ id: `00000000-0000-4000-8000-${(0xa0000 + i).toString(16).padStart(12, "0")}`, text: `${prefix} ${i + 1}` }));
/** The text items of a chip list as the stored entry has them. */
export const itemsOf = (entry: Entry, path: string[]) => getAt(entry.content, path) as { id: string; text: string }[];
