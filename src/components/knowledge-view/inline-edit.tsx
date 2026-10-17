"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
const EditContext = createContext<EditEnv | null>(null);
/** Wraps the sections of an editable draft; a snapshot, a viewer and an archived company have no provider. */
export const EditProvider = EditContext;
/** The editing environment, or null when the view is read-only. */
export const useEdit = () => useContext(EditContext);

const MAX_ITEMS = 500;
const SAVED_MS = 3000;
const UNDO_MS = 10000;
const CONFLICT = "This value changed since the page was loaded. Reload the page to get the latest, then try again.";
const TOO_LONG = `Keep this to ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.`;

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

type Content = Record<string, any>;

/** Parses `content` as the entry of `kind` and prepares its save (a new entry or a new revision). */
function prepareContent(env: EditEnv, kind: EntryKind, content: Content, note: string): PreparedSave {
  return prepareEntrySave({
    companyId: env.companyId,
    actorId: env.actorId,
    kind,
    entry: env.entry(kind),
    content: parseBusinessEntry(kind, content),
    note,
  });
}
/** A copy of the stored content of `kind` (the defaults when the company has no such entry yet). */
const baseOf = (env: EditEnv, kind: EntryKind): Content => structuredClone((env.entry(kind)?.content ?? createEntryDefault(kind)) as Content);
const messageOf = (error: unknown) =>
  error instanceof ZodError ? error.issues.map((issue) => issue.message).join("; ") : ((error as Error)?.message ?? "The change could not be saved.");

/**
 * One save at a time per field: Saving…, then ✓ Saved, or the failure with (when it can be repeated) a Retry that
 * sends the very same request again. A resolved save has been committed; `then` runs once it has, and again after a retry.
 */
function useSaver(env: EditEnv | null) {
  const [feedback, setFeedback] = useState<Feedback>(IDLE);
  const latest = useRef<Feedback>(IDLE);
  const live = useRef(env);
  live.current = env;
  const busy = useRef(false);
  const pending = useRef<{ save: PreparedSave; then?: () => void } | null>(null);
  const show = useCallback((next: Feedback) => {
    latest.current = next;
    setFeedback(next);
  }, []);
  useEffect(() => {
    if (feedback.kind !== "saved") return;
    const timer = setTimeout(() => show(IDLE), SAVED_MS);
    return () => clearTimeout(timer);
  }, [feedback, show]);
  const run = useCallback(
    async (save: PreparedSave, then?: () => void): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      pending.current = { save, then };
      show({ kind: "saving" });
      try {
        await sendEntrySave(save);
      } catch (error) {
        busy.current = false;
        show(failure(error));
        return false;
      }
      pending.current = null;
      try {
        await live.current?.onSaved();
      } catch {
        // The save is committed; the view marks itself stale and offers a reload.
      }
      busy.current = false;
      then?.();
      show({ kind: "saved" });
      return true;
    },
    [show],
  );
  const retry = useCallback(async () => {
    const last = pending.current;
    return last ? run(last.save, last.then) : false;
  }, [run]);
  const clear = useCallback(() => {
    if (!busy.current) show(IDLE);
  }, [show]);
  return { feedback, latest, busy, run, retry, clear };
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

// ---- text fields ------------------------------------------------------------------------------------------------------
/** One text field of an entry: how the editor shows it, and how typed text becomes the entry's content. */
export type TextSpec = {
  label: string;
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
}: TriggerOptions & { label: string; blocked: boolean; onOpen: () => void; triggerRef: RefObject<HTMLElement | null> }) {
  const empty = shown === null || shown === undefined || shown === "";
  const className = `knowledge-view__inline${block ? " knowledge-view__inline--block" : ""}${empty ? " knowledge-view__inline--empty" : ""}`;
  const title = blocked ? "Reload to see the latest before editing again." : "Click to edit";
  const content = (
    <>
      <span className="knowledge-view__inline-text">{empty ? placeholder : shown}</span>
      {!empty && <Icon name="pencil" size={13} />}
    </>
  );
  if (heading)
    return (
      <span
        ref={triggerRef as RefObject<HTMLSpanElement>}
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked || undefined}
        aria-label={`Edit ${label}`}
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
      aria-label={`Edit ${label}`}
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
 * `multiline` a textarea with Save and Cancel). Returns null when the view is read-only.
 */
export function useTextField(spec: TextSpec, multiline = false) {
  const env = useEdit();
  const saver = useSaver(env);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const draftRef = useRef("");
  const open = useRef(false);
  const refocus = useRef(false);
  const field = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const live = useRef({ env, spec });
  live.current = { env, spec };

  useEffect(() => {
    if (editing) {
      const element = field.current;
      if (!element) return;
      element.focus();
      const end = element.value.length;
      element.setSelectionRange(end, end);
    } else if (refocus.current) {
      refocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  const close = (back: boolean) => {
    open.current = false;
    refocus.current = back;
    setProblem("");
    setEditing(false);
  };
  const start = () => {
    const { env: now, spec: target } = live.current;
    if (!now || now.blocked || open.current) return;
    const text = target.read(baseOf(now, target.kind));
    draftRef.current = text;
    open.current = true;
    saver.clear();
    setProblem("");
    setDraft(text);
    setEditing(true);
  };
  const cancel = () => {
    if (!open.current || saver.busy.current) return;
    saver.clear();
    close(true);
  };
  /** Validates the text and saves it; `back` returns focus to the button once the editor closes. */
  const commit = async (back: boolean) => {
    const { env: now, spec: target } = live.current;
    if (!now || !open.current || saver.busy.current) return;
    const base = baseOf(now, target.kind);
    const typed = draftRef.current;
    if (typed.trim() === target.read(base).trim()) {
      saver.clear();
      close(back);
      return;
    }
    const built = target.apply(structuredClone(base), typed);
    if ("error" in built) {
      setProblem(built.error);
      return;
    }
    setProblem("");
    if (canonicalStringify(built.content as BusinessEntry) === canonicalStringify(base as BusinessEntry)) {
      saver.clear();
      close(back);
      return;
    }
    let save: PreparedSave;
    try {
      save = prepareContent(now, target.kind, built.content, `Updated ${target.label} from the knowledge view.`);
    } catch (error) {
      setProblem(messageOf(error));
      return;
    }
    await saver.run(save, () => close(back));
  };

  if (!env) return null;
  const saving = saver.feedback.kind === "saving";
  const typing = (event: { target: { value: string } }) => {
    draftRef.current = event.target.value;
    setDraft(event.target.value);
    setProblem("");
    if (saver.latest.current.kind === "failed") saver.clear();
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && !(multiline && event.shiftKey) && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      void commit(true);
    }
  };
  const notice = <Outcome problem={problem} feedback={saver.feedback} onRetry={() => void saver.retry()} />;
  return {
    editing,
    feedback: notice,
    control(options: TriggerOptions): ReactNode {
      if (!editing)
        return (
          <Trigger
            label={spec.label}
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
            aria-label={spec.label}
            autoComplete="off"
            value={draft}
            readOnly={saving}
            aria-busy={saving || undefined}
            onChange={typing}
            onKeyDown={keys}
            onBlur={() => {
              // A field that was just closed still blurs; a failed save waits for Retry or Enter instead of starting another.
              if (!open.current || saver.busy.current || saver.latest.current.kind === "failed") return;
              void commit(false);
            }}
          />
        );
      const changed = draft.trim() !== spec.read(baseOf(env, spec.kind)).trim();
      return (
        <div className="knowledge-view__inline-area">
          <textarea
            ref={field as RefObject<HTMLTextAreaElement>}
            className="knowledge-view__inline-input knowledge-view__inline-input--area"
            aria-label={spec.label}
            rows={3}
            value={draft}
            readOnly={saving}
            aria-busy={saving || undefined}
            onChange={typing}
            onKeyDown={keys}
          />
          <div className="knowledge-view__inline-actions">
            <button type="button" className="knowledge-view__inline-save" disabled={saving || !changed} onClick={() => void commit(true)}>
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
  const env = useEdit();
  const saver = useSaver(env);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const [toast, setToast] = useState<{ text: string; previous: IdentifiedText[] } | null>(null);
  const draftRef = useRef("");
  const addingRef = useRef(false);
  const refocus = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const live = useRef({ env, list });
  live.current = { env, list };

  useEffect(() => {
    if (adding) field.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      pill.current?.focus();
    }
  }, [adding]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const stored = (): IdentifiedText[] => {
    const { env: now, list: spec } = live.current;
    return ((now ? baseOf(now, spec.kind) : {})[spec.key] ?? []) as IdentifiedText[];
  };
  const prepare = (next: IdentifiedText[], note: string): PreparedSave | null => {
    const { env: now, list: spec } = live.current;
    if (!now) return null;
    try {
      const content = baseOf(now, spec.kind);
      content[spec.key] = next;
      return prepareContent(now, spec.kind, content, note);
    } catch (error) {
      setProblem(messageOf(error));
      return null;
    }
  };
  const closeField = (back: boolean) => {
    addingRef.current = false;
    refocus.current = back;
    draftRef.current = "";
    setDraft("");
    setProblem("");
    setAdding(false);
  };
  async function add() {
    const { env: now, list: spec } = live.current;
    if (!now || now.blocked || saver.busy.current) return;
    const text = draftRef.current.trim();
    if (!text) return;
    const current = stored();
    if (text.length > MAX_TEXT_LENGTH) return void setProblem(TOO_LONG);
    if (current.length >= MAX_ITEMS) return void setProblem(`This list is full: it can hold at most ${MAX_ITEMS} items.`);
    if (current.some((item) => sameText(item.text) === sameText(text))) return void setProblem(`“${text}” is already in the list.`);
    setProblem("");
    const save = prepare([...current, { id: crypto.randomUUID(), text }], `Added ${spec.noun} from the knowledge view.`);
    if (!save) return;
    await saver.run(save, () => {
      draftRef.current = "";
      setDraft("");
      setToast(null);
    });
  }
  async function remove(item: ChipItem) {
    const { env: now, list: spec } = live.current;
    if (!now || now.blocked || saver.busy.current) return;
    const current = stored();
    const save = prepare(current.filter((entry) => entry.id !== item.id), `Removed ${spec.noun} from the knowledge view.`);
    if (!save) return;
    setProblem("");
    await saver.run(save, () => setToast({ text: item.label, previous: current }));
  }
  async function undo() {
    const { env: now, list: spec } = live.current;
    if (!now || now.blocked || saver.busy.current || !toast) return;
    const save = prepare(toast.previous, `Restored the ${spec.noun} list after a removal.`);
    if (!save) return;
    await saver.run(save, () => setToast(null));
  }

  if (!env) return null;
  const { noun } = list;
  const saving = saver.feedback.kind === "saving";
  const locked = env.blocked || saving;
  const showFeedback = !(toast && saver.feedback.kind === "saved");
  return (
    <>
      <ul className="knowledge-view__chips">
        {items.map((item) => (
          <li className="knowledge-view__chip knowledge-view__chip--editable" key={item.id}>
            {item.label}
            {item.mark}
            <button
              type="button"
              className="knowledge-view__chip-remove"
              aria-label={`Remove ${item.label}`}
              disabled={locked}
              onClick={() => void remove(item)}
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
              onChange={(event) => {
                draftRef.current = event.target.value;
                setDraft(event.target.value);
                setProblem("");
                if (saver.latest.current.kind === "failed") saver.clear();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (!saver.busy.current) {
                    saver.clear();
                    closeField(true);
                  }
                } else if (event.key === "Enter" && !event.nativeEvent?.isComposing) {
                  event.preventDefault();
                  void add();
                }
              }}
              onBlur={() => {
                if (!addingRef.current || saver.busy.current || saver.latest.current.kind === "failed") return;
                if (!draftRef.current.trim()) closeField(false);
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
                if (env.blocked) return;
                addingRef.current = true;
                setAdding(true);
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
          <button type="button" className="knowledge-view__toast-undo" disabled={locked} onClick={() => void undo()}>
            Undo
          </button>
        </span>
      )}
      <Outcome problem={problem} feedback={showFeedback ? saver.feedback : IDLE} onRetry={() => void saver.retry()} />
    </>
  );
}
