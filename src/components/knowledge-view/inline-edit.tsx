"use client";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ZodError } from "zod";
import { createEntryDefault, parseBusinessEntry, type BusinessEntry, type EntryKind, type IdentifiedText } from "@/contracts";
import { MAX_TEXT_LENGTH } from "@/contracts/primitives";
import { canonicalStringify } from "@/knowledge/canonical-json";
import { ApiError } from "../api-client";
import { Icon } from "../icons";
import { prepareEntrySave, sendEntrySave, type PreparedSave, type StoredEntry } from "./save-entry";
import { timing } from "./timing";

// ---- what an editable view offers its fields ------------------------------------------------------------------------

/** What the inline editors need from the view: where to save, the entries as stored, and how to reload after a save. */
export type EditEnv = {
  companyId: string;
  actorId: string;
  /** The stored entry of a kind, or null when the company has none yet (the first save creates it). */
  entry: (kind: EntryKind) => StoredEntry | null;
  /** True while the view is older than a saved change: nothing is written until it is reloaded. */
  blocked: boolean;
  /** Reloads the draft after a save. It resolves once the save is committed, even if the reload failed. */
  onSaved: () => Promise<void>;
};

const MAX_ITEMS = 500;
const SAVED_MS = 3000;
const UNDO_MS = 10000;
const CONFLICT = "This value changed since the page was loaded. Reload the page to get the latest, then try again.";
const STALE = "The view is out of date. Reload to see the latest, then make this change again.";
const TOO_LONG = `Keep this to ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.`;

type Content = Record<string, any>;

// ---- saving ---------------------------------------------------------------------------------------------------------
type Feedback =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string; retry: boolean };
const IDLE: Feedback = { kind: "idle" };

/** A failed save in words. A stale revision (409) cannot be repeated; any other failure can. */
function failure(error: unknown): Feedback {
  if (error instanceof ApiError && error.status === 409) return { kind: "failed", message: CONFLICT, retry: false };
  if (error instanceof ZodError) return { kind: "failed", message: error.issues.map((issue) => issue.message).join("; "), retry: false };
  return { kind: "failed", message: (error as Error)?.message || "The change could not be saved.", retry: true };
}

/** Parses `content` as the entry of `kind` and prepares its save (a new entry or a new revision). */
function prepareContent(env: EditEnv, kind: EntryKind, content: Content, note: string, restoreFrom?: Task["restoreFrom"]): PreparedSave {
  return prepareEntrySave({
    companyId: env.companyId,
    actorId: env.actorId,
    kind,
    entry: env.entry(kind),
    content: parseBusinessEntry(kind, content),
    note,
    restoreFrom,
  });
}
/** A copy of the stored content of `kind` (the defaults when the company has no such entry yet). */
const baseOf = (env: EditEnv, kind: EntryKind): Content => structuredClone((env.entry(kind)?.content ?? createEntryDefault(kind)) as Content);
const messageOf = (error: unknown) =>
  error instanceof ZodError ? error.issues.map((issue) => issue.message).join("; ") : ((error as Error)?.message ?? "The change could not be saved.");

/**
 * What one field shows, kept above the sections so that switching section neither drops what was typed nor loses
 * the outcome of a save that finishes (or fails) while the field is not on screen.
 */
type Slot = {
  /** A text field's editor, or a chip list's add field, is open. */
  editing: boolean;
  draft: string;
  /** Why the typed value was refused. */
  problem: string;
  feedback: Feedback;
  /** The last removal of a chip list, which Undo takes back. */
  toast: { text: string; previous: IdentifiedText[]; id: string; revision: number } | null;
  /** Focus goes back to the field's button once its editor has closed (text fields). */
  refocus: boolean;
  /** Where a chip list puts focus next: a chip's id, or "add". `n` makes a repeated request new. */
  focus: { target: string; n: number } | null;
};
const EMPTY: Slot = { editing: false, draft: "", problem: "", feedback: IDLE, toast: null, refocus: false, focus: null };

/** A change to one entry, as a function of the entry's latest content, so that a queued change is rebuilt on the latest revision. */
type Task = {
  kind: EntryKind;
  note: string;
  transform: (content: Content) => Content;
  /** An Undo: put these items back as this earlier revision had them (the server carries their claims over). */
  restoreFrom?: { revision: number; itemIds: string[] };
  /** The revision this change was made on, set when it is built. */
  baseRevision?: number;
  /** Runs once the change is committed (and again after a retry). */
  then?: () => void;
  prepared?: PreparedSave;
};

type Host = {
  env: () => EditEnv;
  slot: (key: string) => Slot;
  patch: (key: string, change: Partial<Slot>) => void;
  isBusy: (key: string) => boolean;
  mount: (key: string) => () => void;
  /** Closes the editor of a field; `back` returns focus to its button. */
  close: (key: string, back: boolean) => void;
  requestFocus: (key: string, target: string) => void;
  submit: (key: string, task: Task) => Promise<boolean>;
  retry: (key: string) => Promise<boolean>;
  clear: (key: string) => void;
};
type EditState = { env: EditEnv; host: Host; slots: Record<string, Slot> };
const EditContext = createContext<EditState | null>(null);
const useSlot = (key: string): { state: EditState | null; slot: Slot } => {
  const state = useContext(EditContext);
  return { state, slot: state?.slots[key] ?? EMPTY };
};
/** The editing environment, or null when the view is read-only. */
export const useEdit = () => useContext(EditContext)?.env ?? null;

/**
 * Wraps the sections of an editable draft; a snapshot, a viewer and an archived company have no provider.
 * It owns what the fields show and runs their saves: one at a time per entry kind, each rebuilt on the revision the
 * view shows once the save before it has been read back, so back-to-back changes never race one another.
 */
export function EditProvider({ env, children }: { env: EditEnv; children: ReactNode }) {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const latest = useRef({ env, slots });
  latest.current.env = env;
  const waiting = useRef<(() => void)[]>([]);
  const hostRef = useRef<Host | null>(null);
  /** False once the provider is gone: saves that have not started are dropped and nothing continues after one that had. */
  const alive = useRef(true);
  /** Set when the view did not show a save's revision in time: the saves of that kind behind it stop until it does. */
  const halted = useRef<{ kind: EntryKind; revision: number } | null>(null);
  // Resolves the saves that wait for the view to show a revision (after every render).
  useEffect(() => {
    const stop = halted.current;
    if (stop && (latest.current.env.entry(stop.kind)?.revision ?? 0) >= stop.revision) halted.current = null;
    for (const check of [...waiting.current]) check();
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const check of [...waiting.current]) check();
    };
  }, []);
  if (!hostRef.current) {
    const busy = new Set<string>();
    const tasks = new Map<string, Task>();
    const queues = new Map<EntryKind, Promise<unknown>>();
    const mounted = new Map<string, number>();
    let focusCount = 0;
    const patch = (key: string, change: Partial<Slot>) => {
      latest.current.slots = { ...latest.current.slots, [key]: { ...(latest.current.slots[key] ?? EMPTY), ...change } };
      setSlots(latest.current.slots);
    };
    const slot = (key: string) => latest.current.slots[key] ?? EMPTY;
    /** Resolves true once the view shows `revision` of the entry of `kind` (or is blocked, or the provider is gone), false if a while passed first. */
    const fresh = (kind: EntryKind, revision: number) =>
      new Promise<boolean>((resolve) => {
        const ready = () => !alive.current || latest.current.env.blocked || (latest.current.env.entry(kind)?.revision ?? 0) >= revision;
        if (ready()) return resolve(true);
        const done = (shown: boolean) => {
          clearTimeout(timer);
          waiting.current = waiting.current.filter((check) => check !== poll);
          resolve(shown);
        };
        const poll = () => ready() && done(true);
        const timer = setTimeout(() => done(false), timing.fresh);
        waiting.current.push(poll);
      });
    const execute = async (key: string, task: Task): Promise<boolean> => {
      const settle = (feedback: Feedback) => {
        busy.delete(key);
        patch(key, { feedback });
        return false;
      };
      // A save that has not started when the provider goes is dropped (the queue is not released against a view that is gone).
      if (!alive.current) return false;
      const env = latest.current.env;
      if (env.blocked || halted.current?.kind === task.kind) return settle({ kind: "failed", message: STALE, retry: false });
      if (!task.prepared) {
        try {
          const base = baseOf(env, task.kind);
          const content = task.transform(structuredClone(base));
          if (canonicalStringify(content as BusinessEntry) === canonicalStringify(base as BusinessEntry)) {
            // Nothing to write any more (the value is already there).
            busy.delete(key);
            tasks.delete(key);
            task.then?.();
            patch(key, { feedback: IDLE });
            return true;
          }
          task.baseRevision = env.entry(task.kind)?.revision ?? 0;
          task.prepared = prepareContent(env, task.kind, content, task.note, task.restoreFrom);
        } catch (error) {
          return settle({ kind: "failed", message: messageOf(error), retry: false });
        }
      }
      const revision = (env.entry(task.kind)?.revision ?? 0) + 1;
      try {
        await sendEntrySave(task.prepared);
      } catch (error) {
        return alive.current ? settle(failure(error)) : false;
      }
      tasks.delete(key);
      if (!alive.current) return false;
      try {
        await latest.current.env.onSaved();
      } catch {
        // The save is committed; the view marks itself stale and offers a reload.
      }
      const shown = await fresh(task.kind, revision);
      if (!alive.current) return false;
      if (!shown) halted.current = { kind: task.kind, revision };
      busy.delete(key);
      task.then?.();
      patch(key, { feedback: { kind: "saved" } });
      return true;
    };
    const enqueue = (key: string, task: Task) => {
      const run = (queues.get(task.kind) ?? Promise.resolve()).then(() => execute(key, task));
      queues.set(task.kind, run.catch(() => undefined));
      return run;
    };
    hostRef.current = {
      env: () => latest.current.env,
      slot,
      patch,
      isBusy: (key) => busy.has(key),
      mount: (key) => {
        mounted.set(key, (mounted.get(key) ?? 0) + 1);
        return () => void mounted.set(key, (mounted.get(key) ?? 1) - 1);
      },
      close: (key, back) => patch(key, { editing: false, problem: "", refocus: back && (mounted.get(key) ?? 0) > 0 }),
      requestFocus: (key, target) => {
        if ((mounted.get(key) ?? 0) > 0) patch(key, { focus: { target, n: ++focusCount } });
      },
      submit: async (key, task) => {
        if (busy.has(key) || latest.current.env.blocked) return false;
        busy.add(key);
        tasks.set(key, task);
        patch(key, { feedback: { kind: "saving" } });
        return enqueue(key, task);
      },
      retry: async (key) => {
        const task = tasks.get(key);
        if (!task || busy.has(key)) return false;
        busy.add(key);
        patch(key, { feedback: { kind: "saving" } });
        return enqueue(key, task);
      },
      clear: (key) => {
        if (!busy.has(key)) patch(key, { feedback: IDLE });
      },
    };
  }
  latest.current.slots = slots;
  return <EditContext value={{ env, host: hostRef.current!, slots }}>{children}</EditContext>;
}

/** The outcome of a save, or the reason a value was refused, as the person should read it. */
function Outcome({ problem, feedback, onRetry }: { problem?: string; feedback: Feedback; onRetry: () => void }) {
  if (problem) return <span className="knowledge-view__inline-alert" role="alert">{problem}</span>;
  if (feedback.kind === "saving") return <span className="knowledge-view__inline-status" role="status">Saving…</span>;
  if (feedback.kind === "saved")
    return (
      <span className="knowledge-view__inline-status" role="status">
        <span aria-hidden="true">✓</span> Saved
      </span>
    );
  if (feedback.kind === "failed")
    return (
      <span className="knowledge-view__inline-failure">
        <span className="knowledge-view__inline-alert" role="alert">{feedback.message}</span>
        {feedback.retry && (
          <button type="button" className="knowledge-view__inline-retry" onClick={onRetry}>
            Retry
          </button>
        )}
      </span>
    );
  return null;
}

/** Clears the "✓ Saved" a few seconds after it appeared. */
function useSavedTimer(state: EditState | null, key: string, feedback: Feedback) {
  useEffect(() => {
    if (!state || feedback.kind !== "saved") return;
    const timer = setTimeout(() => state.host.patch(key, { feedback: IDLE }), SAVED_MS);
    return () => clearTimeout(timer);
  }, [feedback]);
}

/** True when focus is nowhere in particular (an element that held it has just gone), so it may be given back. */
const focusIsFree = () => {
  const active = document.activeElement;
  return !active || active === document.body;
};

// ---- text fields ------------------------------------------------------------------------------------------------------
/** One text field of an entry: how the editor shows it, and how typed text becomes the entry's content. */
export type TextSpec = {
  label: string;
  /** The verb of the button that opens the field and of the field's own name; "Edit" when absent ("Add" for a field that adds an item). */
  action?: string;
  kind: EntryKind;
  /** The field's text as the editor starts with it ("" when empty). */
  read: (content: Content) => string;
  /** The content with the typed text in it, or why the text cannot be saved. */
  apply: (content: Content, text: string) => { content: Content } | { error: string };
};

/** A text value: trimmed, empty means no value, and no longer than the contract allows. */
export function plainText(label: string, kind: EntryKind, key: string): TextSpec {
  return {
    label,
    kind,
    read: (content) => (typeof content[key] === "string" ? content[key] : ""),
    apply: (content, text) => {
      const value = text.trim();
      if (value.length > MAX_TEXT_LENGTH) return { error: TOO_LONG };
      content[key] = value === "" ? null : value;
      return { content };
    },
  };
}

const FOUNDED_HELP = "Enter a 4-digit year, for example 2015.";
const EMPLOYEES_HELP = "Enter a whole number, for example 40.";
const founded: TextSpec = {
  label: "Founded",
  kind: "company_foundation",
  read: (content) => (content.year_founded === null || content.year_founded === undefined ? "" : String(content.year_founded)),
  apply: (content, text) => {
    const value = text.trim();
    if (value === "") {
      content.year_founded = null;
      return { content };
    }
    if (!/^\d{4}$/.test(value) || Number(value) < 1000) return { error: FOUNDED_HELP };
    const year = Number(value);
    const latest = new Date().getUTCFullYear();
    if (year > latest) return { error: `The year cannot be after ${latest}.` };
    content.year_founded = year;
    return { content };
  },
};
const employees: TextSpec = {
  label: "Employees",
  kind: "company_foundation",
  read: (content) => {
    const count = content.employee_count;
    if (!count) return "";
    if (count.exact !== null && count.min === null && count.max === null) return String(count.exact);
    return typeof count.raw === "string" ? count.raw : "";
  },
  apply: (content, text) => {
    const value = text.trim();
    if (value === "") {
      content.employee_count = null;
      return { content };
    }
    if (/^-\s*\d/.test(value)) return { error: "Employees cannot be negative. Enter a whole number, 0 or more." };
    const digits = /^\d{1,3}(,\d{3})+$/.test(value) ? value.replaceAll(",", "") : value;
    if (!/^\d+$/.test(digits) || !Number.isSafeInteger(Number(digits))) return { error: EMPLOYEES_HELP };
    const count = Number(digits);
    // Typing a number replaces whatever was stored (a range, say) with the exact count; the date it was true on stays.
    content.employee_count = { raw: String(count), exact: count, min: null, max: null, as_of: content.employee_count?.as_of ?? null };
    return { content };
  },
};

/** The text fields the three sections edit in place. */
export const FIELDS = {
  legal: plainText("Legal entity", "company_foundation", "legal_entity_type"),
  industry: plainText("Industry", "company_foundation", "industry"),
  overview: plainText("Overview", "company_foundation", "overview"),
  story: plainText("Founding story", "positioning", "founding_story"),
  model: plainText("Business model", "company_foundation", "business_model"),
  pitch: plainText("Pitch", "positioning", "company_pitch"),
  founded,
  employees,
} as const;

/** One list of short texts (each with an id) that the sections edit in place. */
export type ListSpec = { noun: string; kind: EntryKind; key: string };
export const LISTS = {
  names: { noun: "alternate name", kind: "company_foundation", key: "alternative_company_names" },
  roles: { noun: "company role", kind: "company_foundation", key: "company_role" },
  groupings: { noun: "industry grouping", kind: "market_and_customers", key: "industry_groupings" },
  locations: { noun: "service location", kind: "company_foundation", key: "service_locations" },
  buyers: { noun: "buyer", kind: "market_and_customers", key: "target_buyers" },
  needs: { noun: "customer need", kind: "market_and_customers", key: "customer_needs" },
} as const satisfies Record<string, ListSpec>;

type TriggerOptions = {
  shown: ReactNode;
  /** Shown, as an invitation to add a value, when there is none. */
  placeholder: string;
  /** A span with role="button": the trigger sits in a heading, where a <button> would change the heading's text. */
  heading?: boolean;
  block?: boolean;
};

function Trigger({
  label,
  blocked,
  onOpen,
  triggerRef,
  shown,
  placeholder,
  heading = false,
  block = false,
  action = "Edit",
}: TriggerOptions & { label: string; action?: string; blocked: boolean; onOpen: () => void; triggerRef: RefObject<HTMLElement | null> }) {
  const valueId = useId();
  const empty = shown === null || shown === undefined || shown === "";
  const className = `knowledge-view__inline${block ? " knowledge-view__inline--block" : ""}${empty ? " knowledge-view__inline--empty" : ""}`;
  const title = blocked ? "Reload to see the latest before editing again." : "Click to edit";
  // The button is named "Edit <Field>"; the value it shows is its description, so it is still read out.
  const content = (
    <>
      <span id={valueId} className="knowledge-view__inline-text">{empty ? placeholder : shown}</span>
      {!empty && <Icon name="pencil" size={13} />}
    </>
  );
  const describedBy = empty ? undefined : valueId;
  if (heading)
    return (
      <span
        ref={triggerRef as RefObject<HTMLSpanElement>}
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked || undefined}
        aria-label={`${action} ${label}`}
        aria-describedby={describedBy}
        title={title}
        className={className}
        onClick={blocked ? undefined : onOpen}
        onKeyDown={
          blocked
            ? undefined
            : (event: KeyboardEvent) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onOpen();
              }
        }
      >
        {content}
      </span>
    );
  return (
    <button
      ref={triggerRef as RefObject<HTMLButtonElement>}
      type="button"
      aria-label={`${action} ${label}`}
      aria-describedby={describedBy}
      title={title}
      className={className}
      disabled={blocked}
      onClick={onOpen}
    >
      {content}
    </button>
  );
}

/**
 * The state of one inline text field: closed (a button showing the value), or open (a text field, or for
 * `multiline` a textarea with Save and Cancel). Returns null when the view is read-only. What is typed, and the
 * outcome of a save, live above the section (see EditProvider), so they survive a change of section.
 */
export function useTextField(spec: TextSpec, multiline = false) {
  const key = `${spec.kind}/${spec.label}`;
  const { state, slot } = useSlot(key);
  const { editing, draft, problem, feedback } = slot;
  const field = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const host = state?.host;

  useEffect(() => (host ? host.mount(key) : undefined), [host, key]);
  useSavedTimer(state, key, feedback);
  useEffect(() => {
    if (!host) return;
    if (editing) {
      const element = field.current;
      if (!element) return;
      element.focus();
      const end = element.value.length;
      element.setSelectionRange(end, end);
    } else if (slot.refocus) {
      host.patch(key, { refocus: false });
      // Not when the person has already moved on to something else during the save.
      if (focusIsFree()) trigger.current?.focus();
    }
  }, [editing]);

  if (!state || !host) return null;
  const env = state.env;
  const saving = feedback.kind === "saving";
  const start = () => {
    const now = host.env();
    if (now.blocked || host.slot(key).editing) return;
    host.patch(key, { editing: true, draft: spec.read(baseOf(now, spec.kind)), problem: "", feedback: host.isBusy(key) ? host.slot(key).feedback : IDLE });
  };
  const cancel = () => {
    if (!host.slot(key).editing || host.isBusy(key)) return;
    host.patch(key, { feedback: IDLE, draft: "" });
    host.close(key, true);
  };
  /** Validates the text and saves it; `back` returns focus to the button once the editor closes. */
  const commit = (back: boolean) => {
    const now = host.env();
    const current = host.slot(key);
    if (now.blocked || !current.editing || host.isBusy(key)) return;
    const base = baseOf(now, spec.kind);
    const typed = current.draft;
    if (typed.trim() === spec.read(base).trim()) {
      host.patch(key, { feedback: IDLE });
      host.close(key, back);
      return;
    }
    const built = spec.apply(structuredClone(base), typed);
    if ("error" in built) {
      host.patch(key, { problem: built.error });
      return;
    }
    if (canonicalStringify(built.content as BusinessEntry) === canonicalStringify(base as BusinessEntry)) {
      host.patch(key, { problem: "", feedback: IDLE });
      host.close(key, back);
      return;
    }
    try {
      parseBusinessEntry(spec.kind, built.content);
    } catch (error) {
      host.patch(key, { problem: messageOf(error) });
      return;
    }
    host.patch(key, { problem: "" });
    void host.submit(key, {
      kind: spec.kind,
      note: `Updated ${spec.label} from the knowledge view.`,
      transform: (content) => {
        const result = spec.apply(content, typed);
        if ("error" in result) throw new Error(result.error);
        return result.content;
      },
      then: () => host.close(key, back),
    });
  };
  const typing = (event: { target: { value: string } }) =>
    host.patch(key, { draft: event.target.value, problem: "", ...(host.slot(key).feedback.kind === "failed" ? { feedback: IDLE } : {}) });
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && !(multiline && event.shiftKey) && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      commit(true);
    }
  };
  const notice = <Outcome problem={problem} feedback={feedback} onRetry={() => void host.retry(key)} />;
  return {
    editing,
    feedback: notice,
    control(options: TriggerOptions): ReactNode {
      if (!editing)
        return (
          <Trigger
            label={spec.label}
            action={spec.action}
            blocked={env.blocked}
            onOpen={start}
            triggerRef={trigger as RefObject<HTMLElement | null>}
            {...options}
          />
        );
      if (!multiline)
        return (
          <input
            ref={field as RefObject<HTMLInputElement>}
            type="text"
            className={`knowledge-view__inline-input${options.heading ? " knowledge-view__inline-input--heading" : ""}`}
            aria-label={spec.action ? `${spec.action} ${spec.label}` : spec.label}
            autoComplete="off"
            value={draft}
            readOnly={saving}
            aria-busy={saving || undefined}
            onChange={typing}
            onKeyDown={keys}
            onBlur={() => {
              // A field that was just closed still blurs; a failed save waits for Retry or Enter instead of starting another.
              const now = host.slot(key);
              if (!now.editing || host.isBusy(key) || now.feedback.kind === "failed") return;
              commit(false);
            }}
          />
        );
      const changed = draft.trim() !== spec.read(baseOf(env, spec.kind)).trim();
      return (
        <div className="knowledge-view__inline-area">
          <textarea
            ref={field as RefObject<HTMLTextAreaElement>}
            className="knowledge-view__inline-input knowledge-view__inline-input--area"
            aria-label={spec.action ? `${spec.action} ${spec.label}` : spec.label}
            rows={3}
            value={draft}
            readOnly={saving}
            aria-busy={saving || undefined}
            onChange={typing}
            onKeyDown={keys}
          />
          <div className="knowledge-view__inline-actions">
            <button type="button" className="knowledge-view__inline-save" disabled={saving || !changed} onClick={() => commit(true)}>
              Save
            </button>
            <button type="button" className="knowledge-view__inline-cancel" disabled={saving} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      );
    },
  };
}

/** A single-line value that is edited in place (Legal entity, Founded, Employees…). */
export function InlineLine({ spec, shown, placeholder }: { spec: TextSpec; shown: ReactNode; placeholder: string }) {
  const text = useTextField(spec);
  if (!text) return <>{shown ?? placeholder}</>;
  return (
    <>
      {text.control({ shown, placeholder })}
      {text.feedback}
    </>
  );
}

/**
 * A paragraph that is edited in place. With no text it shows `empty` (its title and hint) and an "Add" button
 * in the place of the link to the advanced editor. `note` is the field's coverage note.
 */
export function InlineArea({
  spec,
  value,
  empty,
  note,
}: {
  spec: TextSpec;
  value: string | null;
  empty: { title: string; hint: string };
  note?: ReactNode;
}) {
  const text = useTextField(spec, true);
  if (!text) return null;
  if (value === null && !text.editing)
    return (
      <>
        <div className="knowledge-view__empty">
          <p className="knowledge-view__empty-title">{empty.title}</p>
          <p className="knowledge-view__empty-hint">{empty.hint}</p>
          {note}
          {text.control({ shown: null, placeholder: "+ Add" })}
        </div>
        {text.feedback}
      </>
    );
  return (
    <>
      {text.control({ shown: value, placeholder: "", block: true })}
      {text.feedback}
      {note}
    </>
  );
}

// ---- lists of short texts (chips) ------------------------------------------------------------------------------------
export type ChipItem = { id: string; label: string; mark?: ReactNode };
const sameText = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The chips of one list, each with a Remove button, and an Add button that opens a text field: Enter adds the text.
 * An add or a remove is saved at once; a removal can be undone from the toast that follows it.
 */
export function InlineChips({ list, items }: { list: ListSpec; items: ChipItem[] }) {
  const key = `${list.kind}/${list.key}`;
  const { state, slot } = useSlot(key);
  const { editing: adding, draft, problem, feedback, toast } = slot;
  const field = useRef<HTMLInputElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const removes = useRef(new Map<string, HTMLElement>());
  const host = state?.host;

  useEffect(() => (host ? host.mount(key) : undefined), [host, key]);
  useSavedTimer(state, key, feedback);
  useEffect(() => {
    if (host && adding) field.current?.focus();
  }, [adding]);
  useEffect(() => {
    if (!host || !slot.focus) return;
    const { target } = slot.focus;
    host.patch(key, { focus: null });
    if (target === "add") (host.slot(key).editing ? field.current : pill.current)?.focus();
    else removes.current.get(target)?.focus();
  }, [slot.focus]);
  useEffect(() => {
    if (!host || !toast) return;
    const timer = setTimeout(() => host.patch(key, { toast: null }), UNDO_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!state || !host) return null;
  const { env } = state;
  const { noun } = list;
  const saving = feedback.kind === "saving";
  const locked = env.blocked || saving;
  const storedList = () => (baseOf(host.env(), list.kind)[list.key] ?? []) as IdentifiedText[];
  const closeField = (back: boolean) => {
    host.patch(key, { editing: false, draft: "", problem: "" });
    if (back) host.requestFocus(key, "add");
  };
  const add = () => {
    const now = host.env();
    const current = host.slot(key);
    if (now.blocked || host.isBusy(key)) return;
    const text = current.draft.trim();
    if (!text) return;
    const stored = storedList();
    if (text.length > MAX_TEXT_LENGTH) return host.patch(key, { problem: TOO_LONG });
    if (stored.length >= MAX_ITEMS) return host.patch(key, { problem: `This list is full: it can hold at most ${MAX_ITEMS} items.` });
    if (stored.some((item) => sameText(item.text) === sameText(text))) return host.patch(key, { problem: `“${text}” is already in the list.` });
    host.patch(key, { problem: "" });
    const item = { id: crypto.randomUUID(), text };
    void host.submit(key, {
      kind: list.kind,
      note: `Added ${noun} from the knowledge view.`,
      transform: (content) => {
        const now = (content[list.key] ?? []) as IdentifiedText[];
        if (now.length >= MAX_ITEMS) throw new Error(`This list is full: it can hold at most ${MAX_ITEMS} items.`);
        if (now.some((entry) => sameText(entry.text) === sameText(text))) throw new Error(`“${text}” is already in the list.`);
        content[list.key] = [...now, item];
        return content;
      },
      then: () => host.patch(key, { draft: "", toast: null }),
    });
  };
  const remove = (item: ChipItem, index: number) => {
    if (host.env().blocked || host.isBusy(key)) return;
    const previous = storedList();
    // Focus goes to the next chip, or to the Add control when there is none.
    const next = items[index + 1]?.id ?? "add";
    host.patch(key, { problem: "" });
    const task: Task = {
      kind: list.kind,
      note: `Removed ${noun} from the knowledge view.`,
      transform: (content) => {
        content[list.key] = ((content[list.key] ?? []) as IdentifiedText[]).filter((entry) => entry.id !== item.id);
        return content;
      },
      then: () => {
        host.patch(key, { toast: { text: item.label, previous, id: item.id, revision: task.baseRevision ?? 0 } });
        host.requestFocus(key, next);
      },
    };
    void host.submit(key, task);
  };
  const undo = () => {
    const taken = host.slot(key).toast;
    if (!taken || host.env().blocked || host.isBusy(key)) return;
    void host.submit(key, {
      kind: list.kind,
      note: `Restored the ${noun} list after a removal.`,
      // The item goes back with the claims and evidence it had before the removal (the server checks and carries them over).
      restoreFrom: taken.revision > 0 ? { revision: taken.revision, itemIds: [taken.id] } : undefined,
      transform: (content) => {
        content[list.key] = taken.previous;
        return content;
      },
      then: () => {
        host.patch(key, { toast: null });
        host.requestFocus(key, taken.id);
      },
    });
  };
  const showFeedback = !(toast && feedback.kind === "saved");
  return (
    <>
      <ul className="knowledge-view__chips">
        {items.map((item, index) => (
          <li className="knowledge-view__chip knowledge-view__chip--editable" key={item.id}>
            {item.label}
            {item.mark}
            <button
              ref={(element) => {
                if (element) removes.current.set(item.id, element);
                else removes.current.delete(item.id);
              }}
              type="button"
              className="knowledge-view__chip-remove"
              aria-label={`Remove ${item.label}`}
              disabled={locked}
              onClick={() => remove(item, index)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
        <li className="knowledge-view__chip-slot">
          {adding ? (
            <input
              ref={field}
              type="text"
              className="knowledge-view__chip knowledge-view__chip--input"
              aria-label={`Add ${noun}`}
              placeholder="Add ↵"
              autoComplete="off"
              value={draft}
              disabled={env.blocked}
              readOnly={saving}
              onChange={(event) =>
                host.patch(key, { draft: event.target.value, problem: "", ...(host.slot(key).feedback.kind === "failed" ? { feedback: IDLE } : {}) })
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (!host.isBusy(key)) {
                    host.patch(key, { feedback: IDLE });
                    closeField(true);
                  }
                } else if (event.key === "Enter" && !event.nativeEvent?.isComposing) {
                  event.preventDefault();
                  add();
                }
              }}
              onBlur={() => {
                const now = host.slot(key);
                if (!now.editing || host.isBusy(key) || now.feedback.kind === "failed") return;
                if (!now.draft.trim()) closeField(false);
              }}
            />
          ) : (
            <button
              ref={pill}
              type="button"
              className="knowledge-view__chip knowledge-view__chip--add knowledge-view__chip--add-more"
              aria-label={`Add ${noun}`}
              disabled={env.blocked}
              onClick={() => {
                if (!env.blocked) host.patch(key, { editing: true });
              }}
            >
              Add
            </button>
          )}
        </li>
      </ul>
      {toast && (
        <span className="knowledge-view__toast" role="status">
          Removed “{toast.text}”.{" "}
          <button type="button" className="knowledge-view__toast-undo" disabled={locked} onClick={undo}>
            Undo
          </button>
        </span>
      )}
      <Outcome problem={problem} feedback={showFeedback ? feedback : IDLE} onRetry={() => void host.retry(key)} />
    </>
  );
}

// ---- one-off changes ----------------------------------------------------------------------------------------------------
/**
 * A change that is not typed text (removing an item from a list of objects, say), run through the same save queue as the text
 * fields, with its own outcome. `key` names the change's slot; it is null when the view is read-only.
 */
export function useEntryAction(key: string) {
  const { state, slot } = useSlot(key);
  const host = state?.host;
  useEffect(() => (host ? host.mount(key) : undefined), [host, key]);
  useSavedTimer(state, key, slot.feedback);
  if (!state || !host) return null;
  return {
    /** True while a save is running or the view is older than a saved change. */
    locked: state.env.blocked || slot.feedback.kind === "saving",
    run: (task: { kind: EntryKind; note: string; transform: (content: Content) => Content }) => void host.submit(key, task),
    feedback: <Outcome feedback={slot.feedback} onRetry={() => void host.retry(key)} />,
  };
}
