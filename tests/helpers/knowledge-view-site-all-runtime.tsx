// A small interactive runtime for /knowledge/view, for the Site Knowledge / All sections Quest.
//
// The repository has no DOM environment (vitest runs in node; there is no jsdom, happy-dom or
// testing-library). The older view helpers therefore render to static markup, which cannot show
// what a click does. This helper renders the REAL server page and the REAL client components with
// a tiny function-component runtime (state, reducers, refs, memo, effects, context, ids), keeps the
// resulting element tree so that handlers can be invoked the way a browser would (click, change,
// keydown), re-renders after state changes, and serves the browser's `fetch` from an in-memory
// fake of the company API (draft, sources, entries, revisions) that records every request.
//
// Everything a test sees is public output: the markup a visitor would get (cheerio over
// `view.html()`), roles and accessible names of the rendered elements, and the API requests the UI
// sent. Import this helper OR the older knowledge-view render helpers, never both in one test file
// (both replace "react" hooks and next/* modules).
import React from "react";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, vi } from "vitest";
import { parse, norm, type Page } from "./knowledge-view-dom";
import type { Draft } from "./knowledge-view-fixtures";

const shared = vi.hoisted(() => ({
  dispatcher: null as null | Record<string, (...args: any[]) => any>,
  search: "",
  server: null as null | { draft: unknown; snapshot: unknown; versions: unknown[] },
  refresh: null as null | (() => void),
  /** Every navigation the UI asked for (router.push/replace, history.pushState/replaceState, location.assign). */
  nav: [] as string[],
  /** Path of the element that last received focus() (document.activeElement). */
  focused: null as string | null,
}));

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  const base: any = (real as any).default ?? real;
  const names = [
    "useState", "useReducer", "useRef", "useMemo", "useCallback", "useEffect", "useLayoutEffect",
    "useInsertionEffect", "useId", "useContext", "useImperativeHandle", "useSyncExternalStore",
    "useTransition", "useDeferredValue", "useDebugValue", "useOptimistic",
  ];
  const wrapped = Object.fromEntries(
    names.map((name) => [
      name,
      (...args: unknown[]) =>
        shared.dispatcher?.[name]
          ? shared.dispatcher[name](...args)
          : (base[name] as (...a: unknown[]) => unknown)(...args),
    ]),
  );
  return { ...real, ...wrapped, default: { ...base, ...wrapped } };
});
vi.mock("react-dom", async (original) => {
  // A portal is rendered where it is declared; the fake document has no real container to attach to.
  const real = await original<typeof import("react-dom")>();
  const base: any = (real as any).default ?? real;
  const extra = {
    createPortal: (children: unknown, container: unknown, key?: string) => ({ $$typeof: Symbol.for("react.portal"), children, containerInfo: container, key: key ?? null }),
    flushSync: (fn?: () => unknown) => fn?.(),
  };
  return { ...real, ...extra, default: { ...base, ...extra } };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(shared.search),
  usePathname: () => "/knowledge/view",
  useRouter: () => ({
    push: (url: unknown) => void shared.nav.push(String(url)),
    replace: (url: unknown) => void shared.nav.push(String(url)),
    refresh: () => shared.refresh?.(),
    back: () => {},
    prefetch: () => {},
  }),
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));
vi.mock("@/lib/supabase/server", () => ({
  verifiedSession: async () => ({ client: {}, user: { id: "user-1" } }),
}));
vi.mock("@/server/read-model", () => ({
  readDraft: async () => structuredClone(shared.server!.draft),
}));
vi.mock("@/server/snapshots", async () => {
  // The real reader upgrades a snapshot saved before `site_links` existed, then validates it.
  const { upgradeLegacySnapshot } = await import("../../src/knowledge/legacy-snapshot");
  const { KnowledgeBaseExportSchema } = await import("../../src/contracts");
  return {
    readVersionSummaries: async () => shared.server!.versions,
    readSnapshot: async () => ({
      payload: KnowledgeBaseExportSchema.parse(upgradeLegacySnapshot(structuredClone(shared.server!.snapshot))),
    }),
  };
});
vi.mock("@/server/authorize", () => ({}));
vi.mock("server-only", () => ({}));

// vitest.config.ts defines no "@/" alias: every "@/..." specifier is pointed at its real file.
const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")
        ? [join(dir, entry.name)]
        : [],
  );
}
const PROVIDED = new Set(["@/lib/supabase/server", "@/server/read-model", "@/server/snapshots", "@/server/authorize"]);
for (const file of sourceFiles(SRC)) {
  const id = "@/" + relative(SRC, file).replace(/\.(ts|tsx)$/, "").split(sep).join("/");
  const ids = id.endsWith("/index") ? [id, id.slice(0, -"/index".length)] : [id];
  for (const each of ids) {
    if (!PROVIDED.has(each)) {
      vi.doMock(each, () => import(/* @vite-ignore */ file));
    }
  }
}

// ---- the rendered tree --------------------------------------------------------------------------
export interface HNode {
  tag: string;
  props: Record<string, any>;
  children: (HNode | string)[];
  path: string;
  parent: HNode | null;
}
interface Inst { hooks: any[]; cursor: number }
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- mirrors React's EffectCallback type
interface EffectRec { create: () => void | (() => void); deps?: unknown[]; cleanup?: void | (() => void) }
export interface FakeNode {
  path: string;
  focusCalls: number;
  showModalCalls: number;
  closeCalls: number;
  /** The selection last set on a text control (setSelectionRange / selectionStart / select()), or null. */
  selection: [number, number] | null;
}

const sym = (name: string) => Symbol.for(name);
const FRAGMENT = sym("react.fragment");
const SUSPENSE = sym("react.suspense");
const STRICT = sym("react.strict_mode");
const PROFILER = sym("react.profiler");
const CONTEXT = sym("react.context");
const PROVIDER = sym("react.provider");
const MEMO = sym("react.memo");
const FORWARD_REF = sym("react.forward_ref");

const typeName = (type: any) =>
  typeof type === "string" ? type : type?.displayName ?? type?.name ?? type?.render?.name ?? String(type?.$$typeof?.description ?? "x");

class App {
  insts = new Map<string, Inst>();
  fakes = new Map<string, { node: any; meta: FakeNode }>();
  tree: HNode = { tag: "#root", props: {}, children: [], path: "r", parent: null };
  dirty = false;
  queued = false;
  error: unknown = null;
  idCounter = 0;
  visited = new Set<string>();
  visitedFakes = new Set<string>();
  pending: EffectRec[] = [];
  ctx: [any, unknown][] = [];
  current: Inst | null = null;
  rendering = false;
  documentListeners = new Map<string, Set<(e: any) => void>>();

  constructor(
    public root: React.ReactElement,
    public remake: () => Promise<React.ReactElement>,
  ) {
    shared.refresh = () => {
      void this.remake().then((next) => {
        this.root = next;
        this.markDirty();
      });
    };
  }

  markDirty() {
    this.dirty = true;
    if (this.queued) {
      return;
    }
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.dirty) {
        return;
      }
      try {
        this.render();
      } catch (error) {
        this.error ??= error;
      }
    });
  }

  render() {
    if (this.rendering) {
      this.dirty = true;
      return;
    }
    this.rendering = true;
    try {
      for (let pass = 0; pass < 50; pass++) {
        this.dirty = false;
        this.visited = new Set();
        this.visitedFakes = new Set();
        this.pending = [];
        this.idCounter = 0;
        shared.dispatcher = this.dispatcher;
        const root: HNode = { tag: "#root", props: {}, children: [], path: "r", parent: null };
        try {
          this.expandChildren(this.root, root, "r");
        } finally {
          shared.dispatcher = null;
          this.current = null;
        }
        this.tree = root;
        for (const [path, inst] of [...this.insts]) {
          if (this.visited.has(path)) {
            continue;
          }
          for (const hook of inst.hooks) {
            if (hook && typeof hook === "object" && "create" in hook) {
              (hook as EffectRec).cleanup?.();
            }
          }
          this.insts.delete(path);
        }
        const present = new Set(descendants(root).map((n) => n.path));
        for (const path of [...this.fakes.keys()]) {
          if (!present.has(path)) {
            this.fakes.delete(path);
          }
        }
        const batch = this.pending;
        for (const rec of batch) {
          rec.cleanup?.();
          rec.cleanup = undefined;
        }
        for (const rec of batch) {
          rec.cleanup = rec.create();
        }
        if (!this.dirty) {
          break;
        }
      }
    } finally {
      this.rendering = false;
    }
  }

  flushSync() {
    if (this.dirty) {
      this.render();
    }
    if (this.error) {
      const error = this.error;
      this.error = null;
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrows whatever the rendered component threw
      throw error;
    }
  }

  async settle(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.dirty) {
        this.render();
      }
      if (this.error) {
        const error = this.error;
        this.error = null;
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrows whatever the rendered component threw
        throw error;
      }
    }
  }

  // -- expansion -------------------------------------------------------------------------------
  expandChildren(children: any, parent: HNode, path: string) {
    const list = Array.isArray(children) ? children : [children];
    list.forEach((child, index) => this.expandChild(child, parent, `${path}.${index}`));
  }

  expandChild(child: any, parent: HNode, path: string) {
    if (child === null || child === undefined || typeof child === "boolean") {
      return;
    }
    if (typeof child === "string" || typeof child === "number") {
      parent.children.push(String(child));
      return;
    }
    if (Array.isArray(child)) {
      child.forEach((item, index) => this.expandChild(item, parent, `${path}[${index}]`));
      return;
    }
    if ((child)?.$$typeof === sym("react.portal")) {
      this.expandChildren((child).children, parent, `${path}/portal`);
      return;
    }
    if (!React.isValidElement(child)) {
      return;
    }
    const { type, props } = child as any;
    const key = (child as any).key;
    const here = `${path}/${key !== null && key !== undefined ? `k${key}` : ""}${typeName(type)}`;
    if (typeof type === "string") {
      const { children: kids, ref, ...rest } = props as Record<string, any>;
      const node: HNode = { tag: type, props: rest, children: [], path: here, parent };
      if (ref) {
        this.attachRef(ref, node);
      }
      parent.children.push(node);
      this.expandChildren(kids, node, here);
      return;
    }
    if (type === FRAGMENT || type === SUSPENSE || type === STRICT || type === PROFILER) {
      this.expandChildren(props.children, parent, here);
      return;
    }
    if (type && typeof type === "object") {
      if (type.$$typeof === CONTEXT || type.$$typeof === PROVIDER) {
        const context = type.$$typeof === PROVIDER ? type._context : type;
        this.ctx.push([context, props.value]);
        try {
          this.expandChildren(props.children, parent, here);
        } finally {
          this.ctx.pop();
        }
        return;
      }
      if (type.$$typeof === MEMO) {
        this.expandChild(React.createElement(type.type, { ...props }), parent, here);
        return;
      }
      if (type.$$typeof === FORWARD_REF) {
        const { ref, ...rest } = props;
        this.callComponent((p: any) => type.render(p, ref ?? null), rest, parent, here);
        return;
      }
      return;
    }
    if (typeof type === "function") {
      this.callComponent(type, props, parent, here);
    }
  }

  callComponent(fn: (props: any) => any, props: any, parent: HNode, path: string) {
    let inst = this.insts.get(path);
    if (!inst) {
      inst = { hooks: [], cursor: 0 };
      this.insts.set(path, inst);
    }
    this.visited.add(path);
    inst.cursor = 0;
    const previous = this.current;
    this.current = inst;
    let out: unknown;
    try {
      out = fn(props);
    } finally {
      this.current = previous;
    }
    if (out && typeof (out as any).then === "function") {
      return;
    }
    this.expandChildren(out, parent, `${path}>`);
  }

  /** The fake DOM node standing for a rendered element (created on first use). */
  fakeFor(node: HNode) {
    this.visitedFakes.add(node.path);
    let entry = this.fakes.get(node.path);
    if (!entry) {
      const meta: FakeNode = { path: node.path, focusCalls: 0, showModalCalls: 0, closeCalls: 0, selection: null };
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- test double needs the outer instance inside nested function scopes
      const app = this;
      // A text control's value as the browser holds it: what the user typed (see View.type), else the rendered value.
      let typed: string | undefined;
      const rendered = () => descendants(app.tree).find((n) => n.path === node.path)?.props;
      let seen: unknown;
      const currentValue = () => {
        const props = rendered();
        // A controlled control takes the value its component renders next, as React does.
        if (props?.value !== undefined && !Object.is(props.value, seen)) {
          seen = props.value;
          typed = undefined;
        }
        return typed ?? String(props?.value ?? props?.defaultValue ?? "");
      };
      const target: any = {
        get value() {
          return currentValue();
        },
        set value(next: string) {
          typed = next;
        },
        get selectionStart() {
          return meta.selection?.[0] ?? currentValue().length;
        },
        set selectionStart(start: number) {
          meta.selection = [start, meta.selection?.[1] ?? start];
        },
        get selectionEnd() {
          return meta.selection?.[1] ?? currentValue().length;
        },
        set selectionEnd(end: number) {
          meta.selection = [meta.selection?.[0] ?? end, end];
        },
        setSelectionRange: (start: number, end: number) => {
          meta.selection = [start, end];
        },
        select: () => {
          meta.selection = [0, currentValue().length];
        },
        blur: () => {
          if (shared.focused === meta.path) {
            shared.focused = null;
          }
        },
        setRangeText: () => {},
        tagName: node.tag.toUpperCase(),
        isConnected: true,
        open: false,
        style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        contains: () => false,
        matches: () => false,
        focus: () => {
          meta.focusCalls++;
          shared.focused = meta.path;
        },
        showModal: () => {
          meta.showModalCalls++;
          target.open = true;
        },
        show: () => {
          target.open = true;
        },
        close: () => {
          meta.closeCalls++;
          target.open = false;
        },
        getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        scrollIntoView: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
      };
      entry = { node: target, meta };
      this.fakes.set(node.path, entry);
    }
    return entry;
  }

  attachRef(ref: any, node: HNode) {
    const fresh = !this.fakes.has(node.path);
    const entry = this.fakeFor(node);
    if (!fresh) {
      return;
    }
    if (typeof ref === "function") {
      ref(entry.node);
    } else {
      ref.current = entry.node;
    }
  }

  /** Elements matching a simple selector (#id, tag, [attr], [attr=value]), for document.querySelector. */
  query(selector: string): HNode[] {
    const all = descendants(this.tree);
    const sel = selector.trim();
    let m: RegExpExecArray | null;
    if ((m = /^#([\w:-]+)$/.exec(sel))) {
      return all.filter((n) => n.props.id === m![1]);
    }
    if ((m = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel))) {
      return all.filter((n) => (m![2] === undefined ? n.props[m![1]] !== undefined : String(n.props[m![1]]) === m![2]));
    }
    if (/^[a-z][a-z0-9]*$/i.test(sel)) {
      return all.filter((n) => n.tag === sel.toLowerCase());
    }
    return [];
  }

  // -- hooks -----------------------------------------------------------------------------------
  dispatcher: Record<string, (...args: any[]) => any> = (() => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- test double needs the outer instance inside nested function scopes
    const app = this;
    const slot = <T,>(init: () => T): [T, number, Inst] => {
      const inst = app.current;
      if (!inst) {
        throw new Error("A hook was called outside a component render");
      }
      const index = inst.cursor++;
      if (!(index in inst.hooks)) {
        inst.hooks[index] = init();
      }
      return [inst.hooks[index] as T, index, inst];
    };
    const same = (a?: unknown[], b?: unknown[]) =>
      !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- mirrors React's EffectCallback type
    const effect = (create: () => void | (() => void), deps?: unknown[]) => {
      const [rec, , inst] = slot<EffectRec & { first: boolean }>(() => ({ create, deps: undefined, first: true }));
      if (rec.first || !deps || !same(deps, rec.deps)) {
        rec.first = false;
        rec.create = create;
        rec.deps = deps;
        app.pending.push(rec);
      }
      void inst;
    };
    const noop = () => {};
    return {
      useState: (initial: unknown) => {
        const [cell] = slot(() => {
          const c: any = { value: typeof initial === "function" ? (initial as () => unknown)() : initial };
          c.set = (next: unknown) => {
            const value = typeof next === "function" ? (next as (v: unknown) => unknown)(c.value) : next;
            if (Object.is(value, c.value)) {
              return;
            }
            c.value = value;
            app.markDirty();
          };
          return c;
        });
        return [cell.value, cell.set];
      },
      useReducer: (reducer: (s: unknown, a: unknown) => unknown, initial: unknown, init?: (v: unknown) => unknown) => {
        const [cell] = slot(() => {
          const c: any = { value: init ? init(initial) : initial };
          c.dispatch = (action: unknown) => {
            const value = c.reducer(c.value, action);
            if (Object.is(value, c.value)) {
              return;
            }
            c.value = value;
            app.markDirty();
          };
          return c;
        });
        cell.reducer = reducer;
        return [cell.value, cell.dispatch];
      },
      useRef: (initial: unknown) => slot(() => ({ current: initial }))[0],
      useMemo: (factory: () => unknown, deps?: unknown[]) => {
        const [cell] = slot<any>(() => ({ deps: undefined, value: undefined, ready: false }));
        if (!cell.ready || !deps || !same(deps, cell.deps)) {
          cell.value = factory();
          cell.deps = deps;
          cell.ready = true;
        }
        return cell.value;
      },
      useCallback: (callback: unknown, deps?: unknown[]) => {
        const [cell] = slot<any>(() => ({ deps: undefined, value: undefined, ready: false }));
        if (!cell.ready || !deps || !same(deps, cell.deps)) {
          cell.value = callback;
          cell.deps = deps;
          cell.ready = true;
        }
        return cell.value;
      },
      useEffect: effect,
      useLayoutEffect: effect,
      useInsertionEffect: effect,
      useId: () => slot(() => `:t${++app.idCounter}:`)[0],
      useContext: (context: any) => {
        for (let i = app.ctx.length - 1; i >= 0; i--) {
          if (app.ctx[i][0] === context) {
            return app.ctx[i][1];
          }
        }
        return context._currentValue;
      },
      useImperativeHandle: noop,
      useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
      useTransition: () => [false, (callback: () => void) => callback()],
      useDeferredValue: (value: unknown) => value,
      useDebugValue: noop,
      useOptimistic: (state: unknown) => [state, noop],
    };
  })();
}

// ---- the fake company API -------------------------------------------------------------------------
export interface Req { method: string; path: string; body: any }
interface Failure { status: number; message: string; code?: string }
const IS_WRITE = (method: string) => method !== "GET";

export class FakeServer {
  requests: Req[] = [];
  draft: any;
  snapshot: any = null;
  versions: any[] = [];
  /** The GET /sources body; the default is an inventory with no pages. */
  sources: any = { job: null, pages: [] };
  sourcesFailure: Failure | null = null;
  writeFailure: Failure | null = null;
  /** While set, writes wait for `release()` before they are answered. */
  gate: { promise: Promise<void>; release: () => void } | null = null;

  constructor(init: { draft?: Draft; snapshot?: unknown; versions?: unknown[] }) {
    this.draft = init.draft ? structuredClone(init.draft) : null;
    this.snapshot = init.snapshot ? structuredClone(init.snapshot) : null;
    this.versions = (init.versions as any[]) ?? [];
  }
  hold() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gate = { promise, release };
  }
  release() {
    this.gate?.release();
    this.gate = null;
  }
  get writes(): Req[] {
    return this.requests.filter((r) => IS_WRITE(r.method));
  }
  get gets(): Req[] {
    return this.requests.filter((r) => !IS_WRITE(r.method));
  }
  /** Writes that create a site_links entry or revise an entry, in the order they were sent. */
  writesTo(kind: "entries" | "revisions"): Req[] {
    return this.writes.filter((r) =>
      kind === "entries" ? r.path.endsWith("/entries") : /\/entries\/[^/]+\/revisions$/.test(r.path),
    );
  }

  private reply(status: number, data: unknown, error?: { code: string; message: string; details?: unknown }) {
    const body = { data: error ? null : data, error: error ?? null, requestId: "00000000-0000-4000-8000-0000000000aa" };
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  }

  fetch = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : String((input as any)?.url ?? input);
    const path = url.split("?")[0];
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.requests.push({ method, path, body });
    if (IS_WRITE(method) && this.gate) {
      await this.gate.promise;
    }
    if (method === "GET" && path === "/api/companies") {
      return this.reply(200, { companies: [{ id: this.draft?.company.id ?? "x", name: this.draft?.company.name ?? "x" }] });
    }
    if (method === "GET" && path.endsWith("/versions")) {
      return this.reply(200, this.versions);
    }
    if (method === "GET" && path.endsWith("/draft")) {
      return this.reply(200, structuredClone(this.draft));
    }
    if (method === "GET" && path.endsWith("/sources")) {
      if (this.sourcesFailure) {
        return this.reply(this.sourcesFailure.status, null, { code: this.sourcesFailure.code ?? "unavailable", message: this.sourcesFailure.message });
      }
      return this.reply(200, structuredClone(this.sources));
    }
    if (IS_WRITE(method) && this.writeFailure) {
      return this.reply(this.writeFailure.status, null, {
        code: this.writeFailure.code ?? (this.writeFailure.status === 409 ? "conflict" : "unavailable"),
        message: this.writeFailure.message,
        details: this.writeFailure.status === 409 ? { currentRevision: 99 } : undefined,
      });
    }
    let match = /^\/api\/companies\/([^/]+)\/entries$/.exec(path);
    if (method === "POST" && match && this.draft) {
      const id = body.content && "id" in body.content ? body.content.id : body.requestId;
      const entry = {
        id,
        entry_id: id,
        company_id: this.draft.company.id,
        kind: body.kind,
        revision: 1,
        current_revision: 1,
        schema_version: "1.0.0",
        content: body.content,
        provenance: body.provenance,
        review_status: "unreviewed",
        author_id: this.draft.actorId,
        created_by: this.draft.actorId,
        change_reason: "Entered manually.",
        created_at: "2026-10-16T10:00:00.000Z",
        saved_at: "2026-10-16T10:00:00.000Z",
      };
      this.draft.entries.push(entry);
      this.draft.citationContext = this.draft.citationContext ?? { claims: [], evidence: [], sources: [] };
      return this.reply(201, structuredClone(entry));
    }
    match = /^\/api\/companies\/([^/]+)\/entries\/([^/]+)\/revisions$/.exec(path);
    if (method === "POST" && match && this.draft) {
      const entry = this.draft.entries.find((e: any) => e.id === decodeURIComponent(match[2]));
      if (!entry) {
        return this.reply(404, null, { code: "unavailable", message: "Resource unavailable." });
      }
      if (body.expectedRevision !== entry.current_revision) {
        return this.reply(409, null, { code: "conflict", message: "The saved revision changed.", details: { currentRevision: entry.current_revision } });
      }
      entry.revision = entry.current_revision = entry.current_revision + 1;
      entry.content = body.content;
      entry.provenance = body.provenance;
      entry.review_status = body.reviewStatus;
      return this.reply(200, structuredClone(entry));
    }
    return this.reply(404, null, { code: "not_found", message: "Not found." });
  };
}

// ---- globals the client components may touch ---------------------------------------------------------
function installGlobals(app: App, server: FakeServer, href: string) {
  const listeners = app.documentListeners;
  const eventTarget = {
    addEventListener: (type: string, fn: (e: any) => void) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: any) => void) => listeners.get(type)?.delete(fn),
  };
  const body: any = { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, removeChild() {}, contains: () => false };
  vi.stubGlobal("fetch", server.fetch);
  vi.stubGlobal("document", {
    ...eventTarget,
    body,
    documentElement: body,
    get activeElement() {
      const path = shared.focused;
      return path ? app.fakes.get(path)?.node ?? null : null;
    },
    getElementById: (id: string) => {
      const found = app.query(`#${id}`)[0];
      return found ? app.fakeFor(found).node : null;
    },
    querySelector: (selector: string) => {
      const found = app.query(selector)[0];
      return found ? app.fakeFor(found).node : null;
    },
    querySelectorAll: (selector: string) => app.query(selector).map((n) => app.fakeFor(n).node),
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  });
  vi.stubGlobal("window", {
    ...eventTarget,
    location: {
      href,
      assign: (url: unknown) => void shared.nav.push(String(url)),
      reload: () => {},
      origin: "http://localhost",
      pathname: "/knowledge/view",
      search: new URL(href).search,
    },
    history: {
      replaceState: (_state: unknown, _unused: unknown, url?: unknown) => void (url != null && shared.nav.push(String(url))),
      pushState: (_state: unknown, _unused: unknown, url?: unknown) => void (url != null && shared.nav.push(String(url))),
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1280,
    innerHeight: 800,
    scrollTo: () => {},
    getComputedStyle: () => ({}),
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    cancelAnimationFrame: () => {},
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  shared.refresh = null;
});

// ---- queries over the rendered tree ----------------------------------------------------------------------
export const textOfNode = (n: HNode | string): string => {
  if (typeof n === "string") {
    return n;
  }
  if (n.props["aria-hidden"] === true || n.props["aria-hidden"] === "true") {
    return "";
  }
  const parts = n.children.map(textOfNode);
  return parts.join(n.tag === "#root" ? " " : isInline(n.tag) ? "" : " ");
};
const isInline = (tag: string) => ["span", "a", "strong", "em", "b", "i", "small", "code", "label", "button", "time", "abbr"].includes(tag);

export function descendants(n: HNode): HNode[] {
  const out: HNode[] = [];
  const walk = (node: HNode) => {
    for (const child of node.children) {
      if (typeof child !== "string") {
        out.push(child);
        walk(child);
      }
    }
  };
  walk(n);
  return out;
}
export const ancestorsOf = (n: HNode): HNode[] => {
  const out: HNode[] = [];
  for (let p = n.parent; p; p = p.parent) {
    out.push(p);
  }
  return out;
};
const hiddenProp = (n: HNode) =>
  n.props.hidden === true || n.props.hidden === "" || n.props["aria-hidden"] === true || n.props["aria-hidden"] === "true" ||
  (n.props.style && typeof n.props.style === "object" && (n.props.style).display === "none");
export const isHidden = (n: HNode) => hiddenProp(n) || ancestorsOf(n).some(hiddenProp);

export function roleOf(n: HNode): string {
  if (n.props.role) {
    return String(n.props.role);
  }
  switch (n.tag) {
    case "a": return n.props.href !== undefined ? "link" : "";
    case "button": return "button";
    case "dialog": return "dialog";
    case "ul": case "ol": return "list";
    case "li": return "listitem";
    case "select": return "combobox";
    case "textarea": return "textbox";
    case "form": return "form";
    case "input": {
      const type = String(n.props.type ?? "text");
      return type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : ["button", "submit", "reset"].includes(type) ? "button" : "textbox";
    }
    default: return /^h[1-6]$/.test(n.tag) ? "heading" : "";
  }
}

// ---- the view a test drives -----------------------------------------------------------------------------------
export type SectionLabel =
  | "General Info" | "Customers & Industry" | "Sales & Marketing" | "Business Offerings" | "Brand Identity" | "Site Knowledge" | "All sections";
export const SECTION_IDS: Record<SectionLabel, string> = {
  "General Info": "general",
  "Customers & Industry": "customers",
  "Sales & Marketing": "sales",
  "Business Offerings": "offerings",
  "Brand Identity": "brand",
  "Site Knowledge": "site",
  "All sections": "all",
};

const toReact = (n: HNode | string): React.ReactNode => {
  if (typeof n === "string") {
    return n;
  }
  const { key: _key, ...props } = n.props;
  void _key;
  return React.createElement(n.tag === "#root" ? React.Fragment : n.tag, n.tag === "#root" ? null : props, ...n.children.map(toReact));
};

const keyEvent = (key: string, target: unknown) => ({
  type: "keydown",
  key,
  code: key,
  target,
  currentTarget: target,
  defaultPrevented: false,
  propagationStopped: false,
  preventDefault() { this.defaultPrevented = true; },
  stopPropagation() { this.propagationStopped = true; },
  persist() {},
  nativeEvent: {},
});

export class View {
  constructor(
    public app: App,
    public server: FakeServer,
  ) {}

  /** The markup a visitor would see right now. */
  html(): string {
    return renderToStaticMarkup(React.createElement(React.Fragment, null, ...this.app.tree.children.map(toReact)));
  }
  page(): Page {
    return parse(this.html());
  }
  root(): HNode {
    return this.app.tree;
  }
  all(): HNode[] {
    return descendants(this.app.tree);
  }
  text(scope: HNode = this.app.tree): string {
    return norm(textOfNode(scope));
  }

  /** Accessible name of an element: aria-label, aria-labelledby, an associated or wrapping label, then its text. */
  nameOf(n: HNode): string {
    const label = n.props["aria-label"];
    if (typeof label === "string" && label.trim()) {
      return norm(label);
    }
    const by = n.props["aria-labelledby"];
    if (typeof by === "string") {
      const all = this.all();
      const text = by.split(/\s+/).map((id) => {
        const target = all.find((x) => x.props.id === id);
        return target ? textOfNode(target) : "";
      }).join(" ");
      if (norm(text)) {
        return norm(text);
      }
    }
    if (n.tag === "input" || n.tag === "select" || n.tag === "textarea") {
      const wrapping = ancestorsOf(n).find((a) => a.tag === "label");
      if (wrapping) {
        return norm(textOfNode(wrapping));
      }
      const id = n.props.id;
      if (id) {
        const forLabel = this.all().find((x) => x.tag === "label" && x.props.htmlFor === id);
        if (forLabel) {
          return norm(textOfNode(forLabel));
        }
      }
      if (n.tag === "input" && ["button", "submit", "reset"].includes(String(n.props.type))) {
        return norm(String(n.props.value ?? ""));
      }
      return norm(String(n.props.title ?? ""));
    }
    return norm(textOfNode(n)) || norm(String(n.props.title ?? ""));
  }

  /** Visible elements with this role (and, if given, this accessible name), optionally inside `within`. */
  byRole(role: string, name?: string | RegExp, within?: HNode): HNode[] {
    const pool = within ? descendants(within) : this.all();
    return pool.filter((n) => {
      if (roleOf(n) !== role || isHidden(n)) {
        return false;
      }
      if (name === undefined) {
        return true;
      }
      const accessible = this.nameOf(n);
      return typeof name === "string" ? accessible.toLowerCase() === norm(name).toLowerCase() : name.test(accessible);
    });
  }
  /** Dialogs that are open and visible. "Field evidence" popovers are not the import picker. */
  dialogs(): HNode[] {
    return this.all().filter((n) => {
      const role = roleOf(n);
      if (role !== "dialog" && role !== "alertdialog") {
        return false;
      }
      if (isHidden(n)) {
        return false;
      }
      if (/^field evidence$/i.test(this.nameOf(n))) {
        return false;
      }
      if (n.tag === "dialog" && !n.props.role) {
        const fake = this.app.fakes.get(n.path);
        return n.props.open === true || n.props.open === "" || fake?.node.open === true;
      }
      return true;
    });
  }
  fakeOf(n: HNode): FakeNode | undefined {
    return this.app.fakes.get(n.path)?.meta;
  }
  /** Did focus move into the dialog: autoFocus, a focus() call on a ref inside it, or showModal() on a native dialog. */
  focusMovedInto(dialog: HNode): boolean {
    const inside = [dialog, ...descendants(dialog)];
    if (inside.some((n) => n.props.autoFocus)) {
      return true;
    }
    return inside.some((n) => {
      const fake = this.fakeOf(n);
      return !!fake && (fake.focusCalls > 0 || (n.tag === "dialog" && fake.showModalCalls > 0));
    });
  }

  /** The same element in the latest render (a browser's element keeps its identity while React swaps its handlers). */
  fresh(n: HNode): HNode | null {
    return this.all().find((x) => x.path === n.path) ?? null;
  }
  isDisabled(n: HNode): boolean {
    return n.props.disabled === true || n.props.disabled === "" || ancestorsOf(n).some((a) => a.tag === "fieldset" && a.props.disabled);
  }

  /** A click, bubbled up the way a browser does it; a submit button then submits its form. Returns false for a disabled control. */
  async click(stale: HNode): Promise<boolean> {
    const n = this.fresh(stale);
    if (!n || this.isDisabled(n)) {
      return false;
    }
    const target = { tagName: n.tag.toUpperCase(), value: n.props.value, checked: n.props.checked, name: n.props.name, id: n.props.id, type: n.props.type };
    const event: any = {
      type: "click",
      target,
      currentTarget: target,
      detail: 1,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      persist() {},
      nativeEvent: {},
    };
    for (let node: HNode | null = n; node; node = node.parent) {
      const handler = node.props.onClick;
      if (typeof handler === "function") {
        handler({ ...event, currentTarget: { ...target, tagName: node.tag.toUpperCase() } });
        if (event.propagationStopped) {
          break;
        }
      }
    }
    const submits = n.tag === "button" ? n.props.type === undefined || n.props.type === "submit" : n.tag === "input" && n.props.type === "submit";
    if (submits && !event.defaultPrevented) {
      const form = ancestorsOf(n).find((a) => a.tag === "form" && typeof a.props.onSubmit === "function");
      if (form) {
        form.props.onSubmit({ ...event, type: "submit", target: form, currentTarget: form });
      }
    }
    this.app.flushSync();
    return true;
  }
  /** Check or uncheck a checkbox. Returns false for a disabled one (a browser fires nothing). */
  async check(stale: HNode, checked = true): Promise<boolean> {
    const n = this.fresh(stale);
    if (!n || this.isDisabled(n)) {
      return false;
    }
    const target = { tagName: "INPUT", type: "checkbox", checked, value: n.props.value, name: n.props.name, id: n.props.id };
    const event = { type: "change", target, currentTarget: target, preventDefault() {}, stopPropagation() {}, persist() {}, nativeEvent: {} };
    if (typeof n.props.onChange === "function") {
      n.props.onChange(event);
    } else if (typeof n.props.onClick === "function") {
      n.props.onClick({ ...event, type: "click" });
    }
    this.app.flushSync();
    return true;
  }
  /** A key pressed while focus is on the first control inside `scope` (or on `scope` itself). */
  async press(staleScope: HNode, key: string): Promise<void> {
    const scope = this.fresh(staleScope) ?? staleScope;
    const focusable = descendants(scope).find((d) => ["button", "input", "a", "select", "textarea"].includes(d.tag) && !this.isDisabled(d)) ?? scope;
    const event: any = keyEvent(key, { tagName: focusable.tag.toUpperCase() });
    for (let node: HNode | null = focusable; node; node = node.parent) {
      const handler = node.props.onKeyDown ?? node.props.onKeyUp;
      if (typeof handler === "function") {
        handler(event);
        if (event.propagationStopped) {
          break;
        }
      }
    }
    if (key === "Escape") {
      const native = [scope, ...descendants(scope)].find((n) => n.tag === "dialog" && typeof n.props.onCancel === "function");
      if (native) {
        native.props.onCancel({ type: "cancel", preventDefault() {}, stopPropagation() {}, target: native, currentTarget: native });
      }
    }
    for (const type of ["keydown", "keyup"]) {
      for (const fn of this.app.documentListeners.get(type) ?? []) {
        fn(keyEvent(key, focusable));
      }
    }
    this.app.flushSync();
  }
  async settle(rounds?: number) {
    await this.app.settle(rounds);
  }
}

export interface OpenOptions {
  section?: SectionLabel;
  draft?: Draft;
  snapshot?: { payload: unknown; versionId: string };
  versions?: { id: string; version_number: number; created_at: string }[];
  /** A raw `section` URL value (used instead of `section`), e.g. an identifier or an unknown value. */
  rawSection?: string;
  /** Put companyId, versionId and these extra parameters in the URL the client reads (useSearchParams / location). */
  fullUrl?: { extra?: Record<string, string> };
  /** Configure the fake API before the page renders (sources, failures). */
  server?: (server: FakeServer) => void;
}

/** Mount any element in the runtime (used to check the runtime itself). */
export async function mountElement(element: React.ReactElement, server = new FakeServer({})): Promise<View> {
  shared.nav = [];
  shared.focused = null;
  const app = new App(element, async () => element);
  installGlobals(app, server, "http://localhost/");
  app.render();
  const view = new View(app, server);
  await view.settle();
  return view;
}

/** Render /knowledge/view as a visitor receives it and make it interactive. */
export async function openView(opts: OpenOptions): Promise<View> {
  const payload = opts.snapshot?.payload as { company_id?: string } | undefined;
  const companyId = (payload?.company_id ?? opts.draft?.company.id)!;
  const server = new FakeServer({ draft: opts.draft, snapshot: opts.snapshot?.payload, versions: opts.versions ?? [] });
  opts.server?.(server);
  shared.server = server;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- rawSection: null must keep winning over the section lookup
  const sectionId = opts.rawSection !== undefined ? opts.rawSection : opts.section ? SECTION_IDS[opts.section] : undefined;
  const versionParam = opts.snapshot ? opts.snapshot.versionId : "draft";
  const clientQuery = new URLSearchParams(
    opts.fullUrl
      ? { companyId: companyId, versionId: versionParam, ...(opts.fullUrl.extra ?? {}), ...(sectionId ? { section: sectionId } : {}) }
      : sectionId ? { section: sectionId } : {},
  ).toString();
  shared.search = clientQuery;
  shared.nav = [];
  shared.focused = null;
  const make = async () => {
    const { default: ViewPage } = await import("../../src/app/(authenticated)/knowledge/view/page");
    return (await ViewPage({
      searchParams: Promise.resolve({
        companyId,
        versionId: opts.snapshot ? opts.snapshot.versionId : "draft",
        ...(sectionId ? { section: sectionId } : {}),
      }),
    } as never)) as React.ReactElement;
  };
  const app = new App(await make(), make);
  installGlobals(
    app,
    server,
    opts.fullUrl
      ? `http://localhost/knowledge/view?${clientQuery}`
      : `http://localhost/knowledge/view?companyId=${companyId}${sectionId ? `&section=${sectionId}` : ""}`,
  );
  app.render();
  const view = new View(app, server);
  await view.settle();
  return view;
}

/** Navigations requested since the view was opened, in order (URLs as the UI passed them). */
export const navigations = () => [...shared.nav];
export const clearNavigations = () => void (shared.nav = []);
/** Path of the element that last received focus (null if none). */
export const focusedPath = () => shared.focused;
/** Simulate the browser focusing an element (e.g. a click on a button focuses it). */
export const focusPath = (path: string | null) => void (shared.focused = path);
/** Document-level listeners registered by the UI for an event type. */
export const documentHandlers = (view: View, type: string) => [...(view.app.documentListeners.get(type) ?? [])];
