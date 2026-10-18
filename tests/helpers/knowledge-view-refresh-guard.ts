// Helpers for the refresh-draft-guard acceptance tests (Quest Q19).
//
// KnowledgeViewer re-reads the draft after every save a person makes in the view (an import, "+ Add page",
// a people action, an inline edit). These helpers let a test decide WHEN each of those reads is answered, and
// with what, so that the order in which answers arrive can be controlled:
//   - `reads.holdNext()` holds the next GET .../draft: the server's answer (the draft as it is when the request
//     is sent, as a real server would compute it) is delivered only when the test calls `read.release()`, or is
//     replaced by an error with `read.fail()`. A held read honours its AbortSignal like a real fetch.
//   - `reads.holdVersionNext()` does the same for the next GET .../versions/<id> (a saved version being opened).
//   - `reads.failing = true` answers every draft read with 503 until it is set back to false.
// The fake API of the interactive runtime also lacks GET .../versions/<id>; it is answered here from
// `server.snapshot`. Import this helper before any component module (it loads the interactive runtime).
import { expect } from "vitest";
import {
  descendants,
  openView,
  type FakeServer,
  type HNode,
  type View,
} from "./knowledge-view-site-all-runtime";
import { COMPANY_ID, SNAPSHOT_ID, VERSIONS, snapshotFrom, type Draft } from "./knowledge-view-fixtures";
import { FULL_INVENTORY, LINKS, PAGES, siteDraft } from "./knowledge-view-site-all-fixtures";
import { PEOPLE, peopleDraft } from "./knowledge-view-people-fixtures";
import { editAndEnter, editButton, key, LEGAL, STORY, one, startEdit, type } from "./knowledge-view-inline-edit";
import { addPage } from "./knowledge-view-add-page";
import { confirm, openPicker, selectPages } from "./knowledge-view-site-all-import";
import { addPersonButton, rowNodes } from "./knowledge-view-people-driver";

export { COMPANY_ID, SNAPSHOT_ID, VERSIONS };
export const OTHER_COMPANY_ID = "00000000-0000-4000-8000-0000000c0009";
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- controlled reads -------------------------------------------------------------------------------------------
export interface Read {
  /** Which request this is, counting from 1 among the reads of its kind that were held. */
  n: number;
  path: string;
  state: "pending" | "released" | "failed" | "aborted";
  /** The answer arrives (the content the server computed when the request was sent). */
  release(): void;
  /** The answer is an error (503 "Draft store is down." unless told otherwise). */
  fail(message?: string): void;
}
export interface Reads {
  /** Draft reads that were held, in the order they were sent. */
  drafts: Read[];
  /** Saved-version reads that were held. */
  versions: Read[];
  holdNext(count?: number): void;
  holdVersionNext(count?: number): void;
  /** While true every draft read that is not held fails with 503. */
  failing: boolean;
  /** Number of GET .../draft requests the server has seen so far. */
  draftGets(): number;
  versionGets(): number;
}

const reply = (status: number, data: unknown, error?: { code: string; message: string }) => {
  const body = { data: error ? null : data, error: error ?? null, requestId: "00000000-0000-4000-8000-0000000000aa" };
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
};
const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

export function controlReads(server: FakeServer, other?: { draft: Draft }): Reads {
  const base = server.fetch;
  const state = { hold: 0, holdVersion: 0 };
  const reads: Reads = {
    drafts: [],
    versions: [],
    failing: false,
    holdNext: (count = 1) => void (state.hold += count),
    holdVersionNext: (count = 1) => void (state.holdVersion += count),
    draftGets: () => server.requests.filter((r) => r.method === "GET" && r.path.endsWith("/draft")).length,
    versionGets: () => server.requests.filter((r) => r.method === "GET" && /\/versions\/[^/]+$/.test(r.path)).length,
  };
  const hold = (list: Read[], path: string, answer: Promise<any>, signal?: AbortSignal) =>
    new Promise<any>((resolve, reject) => {
      const read: Read = {
        n: list.length + 1,
        path,
        state: "pending",
        release: () => {
          if (read.state !== "pending") {
            return;
          }
          read.state = "released";
          void answer.then(resolve, reject);
        },
        fail: (message = "Draft store is down.") => {
          if (read.state !== "pending") {
            return;
          }
          read.state = "failed";
          resolve(reply(503, null, { code: "unavailable", message }));
        },
      };
      list.push(read);
      signal?.addEventListener("abort", () => {
        if (read.state !== "pending") {
          return;
        }
        read.state = "aborted";
        reject(abortError());
      });
    });
  server.fetch = (async (input: unknown, init?: { method?: string; body?: unknown; signal?: AbortSignal }) => {
    const path = String(input).split("?")[0];
    const method = (init?.method ?? "GET").toUpperCase();
    if (init?.signal?.aborted && method === "GET") {
      throw abortError();
    }
    if (method === "GET" && other && path === `/api/companies/${OTHER_COMPANY_ID}/draft`) {
      server.requests.push({ method, path, body: undefined });
      return reply(200, structuredClone(other.draft));
    }
    if (method === "GET" && other && path === `/api/companies/${OTHER_COMPANY_ID}/versions`) {
      server.requests.push({ method, path, body: undefined });
      return reply(200, []);
    }
    if (method === "GET" && /\/versions\/[^/]+$/.test(path)) {
      server.requests.push({ method, path, body: undefined });
      const answer = Promise.resolve(reply(200, structuredClone(server.snapshot)));
      if (state.holdVersion > 0) {
        state.holdVersion--;
        return hold(reads.versions, path, answer, init?.signal);
      }
      return answer;
    }
    if (method === "GET" && path.endsWith("/draft")) {
      if (state.hold > 0) {
        state.hold--;
        // The base answer is computed now, as a server does when the request arrives.
        return hold(reads.drafts, path, base(input, init), init?.signal);
      }
      if (reads.failing) {
        server.requests.push({ method, path, body: undefined });
        return reply(503, null, { code: "unavailable", message: "Draft store is down." });
      }
    }
    return base(input, init);
  }) as typeof server.fetch;
  return reads;
}

// ---- the view, the version selector, the notices ------------------------------------------------------------------
export const selector = (view: View): HNode => one(view.byRole("combobox", "Knowledge version"), "the version selector");
export const selected = (view: View) => String((view.fresh(selector(view)) ?? selector(view)).props.value);
export async function selectVersion(view: View, id: string): Promise<void> {
  selector(view).props.onChange({ target: { value: id } });
  view.app.flushSync();
  await view.settle();
}
export async function switchTo(view: View, label: string): Promise<void> {
  const trigger = one(view.byRole("button", /knowledge section/i), "the section button");
  await view.click(trigger);
  await view.settle();
  await view.click(one(view.byRole("option", label), `the "${label}" option`));
  await view.settle();
}
/** The message a person is told when a saved change could not be read back. */
export const STALE_NOTICE = /saved\. reload to see the latest/i;
/** Anything that reports a failure of the draft read or of the view. */
export const FAILURE_TEXT = /saved\. reload|draft could not be read|was not read in time|draft store is down|unavailable/i;
export const staleSentence = (view: View) => /saved\. reload to see the latest (\w+)\./i.exec(view.text())?.[1] ?? null;
export const reloadButtons = (view: View) => view.byRole("button", /^reload$/i);
export const isDisabled = (view: View, node: HNode) => {
  const now = view.fresh(node) ?? node;
  return view.isDisabled(now) || now.props["aria-disabled"] === true || now.props["aria-disabled"] === "true";
};

// ---- one draft that has every kind of save ----------------------------------------------------------------------------
/** The standard draft with four key people and a site_links entry. */
export function universalDraft(): Draft {
  const draft = peopleDraft();
  draft.entries.push(...siteDraft().entries.filter((e) => e.kind === "site_links"));
  return draft;
}

export interface Opened { view: View; reads: Reads; snapshot: ReturnType<typeof snapshotFrom> }
export async function openGuarded(sectionId: "general" | "site" | "key-people", opts: { draft?: Draft; other?: Draft } = {}): Promise<Opened> {
  const draft = opts.draft ?? universalDraft();
  const snapshot = snapshotFrom(draft);
  let reads!: Reads;
  const view = await openView({
    rawSection: sectionId,
    fullUrl: {},
    draft,
    versions: VERSIONS,
    server: (server) => {
      server.sources = FULL_INVENTORY();
      server.snapshot = snapshot;
      reads = controlReads(server, opts.other ? { draft: opts.other } : undefined);
    },
  });
  return { view, reads, snapshot };
}

// ---- the four ways to save ---------------------------------------------------------------------------------------------
export interface Driver {
  name: string;
  /** What the stale notice says the person is missing after this kind of save. */
  wording: "links" | "changes";
  sectionId: "general" | "site" | "key-people";
  sectionLabel: string;
  /** Make one save; its draft re-read is the next draft read the server receives. */
  act(view: View): Promise<void>;
  /** True while the view shows what the save wrote. */
  shows(view: View): boolean;
  /** True when the person can make the same kind of save again (nothing is blocked). */
  ready(view: View): boolean;
}
const NEW_PAGE = "https://www.harborandpine.example/new-arrivals";
const buttonNamed = (view: View, name: RegExp) => view.byRole("button", name)[0];

export const INLINE: Driver = {
  name: "inline edit",
  wording: "changes",
  sectionId: "general",
  sectionLabel: "General Info",
  act: async (view) => void (await editAndEnter(view, LEGAL, "Partnership")),
  shows: (view) => view.text().includes("Partnership"),
  ready: (view) => {
    const button = view.byRole("button", "Edit Legal entity")[0];
    return !!button && !isDisabled(view, button);
  },
};
export const INLINE_STORY: Driver = {
  ...INLINE,
  name: "inline edit (founding story)",
  act: async (view) => {
    const area = await startEdit(view, STORY);
    await type(view, area, "A story told again");
    await key(view, area, "Enter");
    await view.settle();
  },
  shows: (view) => view.text().includes("A story told again"),
  ready: (view) => {
    const button = view.byRole("button", "Edit Founding story")[0];
    return !!button && !isDisabled(view, button);
  },
};
export const ADD_PAGE: Driver = {
  name: "add page",
  wording: "links",
  sectionId: "site",
  sectionLabel: "Site Knowledge",
  act: (view) => addPage(view, NEW_PAGE, "New arrivals"),
  shows: (view) => view.text().includes("New arrivals"),
  ready: (view) => {
    const button = buttonNamed(view, /^\+\s*add page$/i);
    return !!button && !isDisabled(view, button);
  },
};
export const IMPORT: Driver = {
  name: "import",
  wording: "links",
  sectionId: "site",
  sectionLabel: "Site Knowledge",
  act: async (view) => {
    await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await confirm(view);
  },
  shows: (view) => view.text().includes(PAGES.shop.title!),
  ready: (view) => {
    const button = buttonNamed(view, /^import from website$/i);
    return !!button && !isDisabled(view, button);
  },
};
const PEOPLE_BEFORE = PEOPLE.length;
export const PERSON: Driver = {
  name: "people action",
  wording: "links",
  sectionId: "key-people",
  sectionLabel: "Key People",
  act: async (view) => {
    const add = addPersonButton(view);
    expect(add, 'an "Add person" button').toBeTruthy();
    await view.click(add);
    await view.settle(8);
  },
  shows: (view) => rowNodes(view).length === PEOPLE_BEFORE + 1,
  ready: (view) => {
    const add = addPersonButton(view);
    return !!add && !isDisabled(view, add);
  },
};
/** Every kind of save that re-reads the draft (the inline edit of another field is INLINE_STORY). */
export const DRIVERS: Driver[] = [INLINE, ADD_PAGE, IMPORT, PERSON];

/** Some text every kind of view shows, to tell one view's content from another's. */
export const shownText = (view: View) => view.text();
export const hasNode = (view: View, pred: (n: HNode) => boolean) => descendants(view.root()).some(pred);
export { editButton, LINKS };
