// Drivers for the interactive Key People tests: the fake company API of
// knowledge-view-site-all-runtime gains the two routes it lacks (uploads and entry deletion),
// and small finders over the rendered tree. Import this helper together with
// knowledge-view-site-all-runtime only; never with another render helper.
import { expect } from "vitest";
import {
  descendants,
  focusedPath,
  openView,
  roleOf,
  type FakeServer,
  type HNode,
  type OpenOptions,
  type View,
} from "./knowledge-view-site-all-runtime";
import { norm } from "./knowledge-view-dom";

export type Failure = { status: number; code: string; message: string };
export type PeopleApi = {
  /** Multipart bodies sent to POST .../uploads. */
  uploads: { path: string; form: FormData }[];
  /** DELETE .../entries/<id> requests (path + parsed JSON body). */
  deletes: { path: string; body: any }[];
  /** Answer the next uploads with this failure (cleared by setting null). */
  uploadFailure: Failure | null;
  /** The reference the server returns for a successful upload (id is fresh per upload). */
  uploaded: { id: string; path: string; content_type: string; size_bytes: number; url: string }[];
};

/** Teach the fake API the routes the Quest relies on. DELETE /entries/<id> is the shape the Quest locks (builder work). */
export function installPeopleApi(server: FakeServer): PeopleApi {
  const api: PeopleApi = { uploads: [], deletes: [], uploadFailure: null, uploaded: [] };
  const base = server.fetch;
  const reply = (status: number, data: unknown, error?: { code: string; message: string }) => {
    const body = { data: error ? null : data, error: error ?? null, requestId: "00000000-0000-4000-8000-0000000000aa" };
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  let counter = 0;
  server.fetch = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : String((input as any)?.url ?? input);
    const path = url.split("?")[0]!;
    const method = (init?.method ?? "GET").toUpperCase();
    const company = server.draft?.company.id as string;
    if (method === "POST" && /^\/api\/companies\/[^/]+\/uploads$/.test(path)) {
      server.requests.push({ method, path, body: init?.body });
      api.uploads.push({ path, form: init?.body as FormData });
      if (api.uploadFailure) return reply(api.uploadFailure.status, null, api.uploadFailure);
      const id = `00000000-0000-4000-8000-00000ff${(0xa00 + ++counter).toString(16).padStart(5, "0")}`;
      const out = { id, path: `portraits/${company}/${id}.png`, content_type: "image/png", size_bytes: 4096, url: `/api/companies/${company}/uploads/${id}` };
      api.uploaded.push(out);
      return reply(201, out);
    }
    const entry = /^\/api\/companies\/[^/]+\/entries\/([^/]+)$/.exec(path);
    if (method === "DELETE" && entry && !server.writeFailure) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      server.requests.push({ method, path, body });
      api.deletes.push({ path, body });
      const found = server.draft.entries.find((e: any) => e.id === decodeURIComponent(entry[1]!));
      if (!found) return reply(404, null, { code: "not_found", message: "Not found." });
      if (body?.expectedRevision !== found.current_revision)
        return reply(409, null, { code: "conflict", message: "The saved revision changed." });
      server.draft.entries = server.draft.entries.filter((e: any) => e !== found);
      return reply(200, { id: found.id });
    }
    if (method === "DELETE") {
      // a configured write failure answers it; record the request the way the base does
      const out = await base(input, init);
      if (entry) api.deletes.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return out;
    }
    return base(input, init);
  };
  return api;
}

export type Opened = { view: View; api: PeopleApi; server: FakeServer };
export async function openKeyPeople(opts: Omit<OpenOptions, "section" | "rawSection" | "fullUrl" | "server"> & { all?: boolean; configure?: (s: FakeServer, a: PeopleApi) => void }): Promise<Opened> {
  let api!: PeopleApi;
  let fake!: FakeServer;
  const { all, configure, ...rest } = opts;
  const view = await openView({
    ...rest,
    ...(all ? { section: "All sections" as const } : { rawSection: "key-people" }),
    fullUrl: {},
    server: (s) => {
      fake = s;
      api = installPeopleApi(s);
      configure?.(s, api);
    },
  });
  return { view, api, server: fake };
}

// ---- finders -------------------------------------------------------------------------------
const LIST_ROLES = ["list", "listbox", "navigation", "tablist", "menu", "radiogroup"];
export function peopleListNode(view: View): HNode | null {
  return (
    view.all().find((n) => {
      if (!(LIST_ROLES.includes(roleOf(n)) || ["ul", "ol", "nav"].includes(n.tag)) || !/\bpeople\b|\bpersons?\b/i.test(view.nameOf(n))) return false;
      return !/^knowledge section/i.test(view.nameOf(n));
    }) ?? null
  );
}
export function rowNodes(view: View): HNode[] {
  const list = peopleListNode(view);
  if (!list) return [];
  const items = descendants(list).filter((n) => ["listitem", "option", "tab", "menuitem"].includes(roleOf(n)));
  return items.filter((n) => !items.some((o) => o !== n && descendants(o).includes(n)));
}
/** The thing a user presses to select the row: its first button, else the row. */
export const rowTarget = (view: View, row: HNode): HNode => descendants(row).find((n) => roleOf(n) === "button" || roleOf(n) === "link") ?? row;
export const rowTexts = (view: View) => rowNodes(view).map((r) => view.text(r));

export function buttons(view: View, pattern: RegExp, within?: HNode): HNode[] {
  return view.byRole("button", undefined, within).filter((b) => pattern.test(view.nameOf(b)));
}
export const addPersonButton = (view: View) => buttons(view, /^\+?\s*add person$/i)[0] ?? null;
export const deleteButtons = (view: View) => view.byRole("button").filter((b) => /^delete\b/i.test(view.nameOf(b)) && !insideDialog(view, b));
export function insideDialog(view: View, n: HNode): boolean {
  return view.dialogs().some((d) => d === n || descendants(d).includes(n));
}
export function fileInput(view: View): HNode | null {
  return view.all().find((n) => n.tag === "input" && n.props.type === "file") ?? null;
}
/** Choose a file in a file input the way a browser reports it. */
export async function chooseFile(view: View, input: HNode, file: File): Promise<void> {
  const fresh = view.fresh(input) ?? input;
  const target = { tagName: "INPUT", type: "file", files: [file], value: `C:\\fakepath\\${file.name}`, name: fresh.props.name, id: fresh.props.id };
  const event = { type: "change", target, currentTarget: target, preventDefault() {}, stopPropagation() {}, persist() {}, nativeEvent: {} };
  fresh.props.onChange?.(event);
  view.app.flushSync();
  await view.settle(8);
}
export const png = (name = "portrait.png", size = 64) => new File([new Uint8Array(size)], name, { type: "image/png" });

/** The node that holds focus (focus() call), else an autoFocus element. */
export function focusedNode(view: View): HNode | null {
  const path = focusedPath();
  return (path ? view.all().find((n) => n.path === path) : null) ?? null;
}
/** Text that names the focused element (its text or accessible name). */
export const focusedName = (view: View) => {
  const n = focusedNode(view);
  return n ? `${view.nameOf(n)} ${view.text(n)}`.trim() : "";
};
export function need<T>(value: T | null | undefined, what: string): T {
  expect(value, what).toBeTruthy();
  return value as T;
}
export { norm, roleOf };
