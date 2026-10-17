// Helpers for the Business Offerings / Brand Identity inline-editing acceptance tests (Quest Q8).
//
// Public output only: roles, accessible names, text and the HTTP requests the page sends. The fake company API of
// knowledge-view-site-all-runtime gains the two routes it lacks: DELETE /api/companies/:id/entries/:entryId and
// PATCH /api/companies/:id. Import this helper together with knowledge-view-inline-edit (never with another
// render helper).
import { draftFrom, type Draft } from "./knowledge-view-fixtures";
import { brandBusiness, offeringsBusiness } from "./knowledge-view-offerings-brand-fixtures";
import { click, must, one, rawText, type Entry } from "./knowledge-view-inline-edit";
import {
  navigations,
  openView,
  type FakeServer,
  type HNode,
  type OpenOptions,
  type View,
} from "./knowledge-view-site-all-runtime";

export type ObApi = {
  deletes: { path: string; body: any }[];
  patches: { path: string; body: any }[];
};
const reply = (status: number, data: unknown, error?: { code: string; message: string }) => {
  const body = { data: error ? null : data, error: error ?? null, requestId: "00000000-0000-4000-8000-0000000000aa" };
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
};

/** Teach the fake API entry deletion and the company rename; a configured write failure still answers first. */
export function installObApi(server: FakeServer): ObApi {
  const api: ObApi = { deletes: [], patches: [] };
  const base = server.fetch;
  server.fetch = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : String((input as any)?.url ?? input);
    const path = url.split("?")[0]!;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const entry = /^\/api\/companies\/[^/]+\/entries\/([^/]+)$/.exec(path);
    const company = /^\/api\/companies\/([^/]+)$/.exec(path);
    if (method === "DELETE" && entry) {
      if (server.writeFailure) {
        api.deletes.push({ path, body });
        return base(input, init);
      }
      server.requests.push({ method, path, body });
      api.deletes.push({ path, body });
      if (server.gate) await server.gate.promise;
      const found = server.draft.entries.find((e: any) => e.id === decodeURIComponent(entry[1]!));
      if (!found) return reply(404, null, { code: "not_found", message: "Not found." });
      if (body?.expectedRevision !== found.current_revision) return reply(409, null, { code: "conflict", message: "The saved revision changed." });
      server.draft.entries = server.draft.entries.filter((e: any) => e !== found);
      return reply(200, { id: found.id });
    }
    if (method === "PATCH" && company) {
      if (server.writeFailure) {
        api.patches.push({ path, body });
        return base(input, init);
      }
      server.requests.push({ method, path, body });
      api.patches.push({ path, body });
      if (body?.expectedGeneration !== server.draft.draftGeneration) return reply(409, null, { code: "conflict", message: "The saved revision changed." });
      server.draft.company = { ...server.draft.company, name: body.name };
      server.draft.draftGeneration += 1;
      return reply(200, server.draft.company);
    }
    return base(input, init);
  };
  return api;
}

export const offeringsDraftAs = (role: "owner" | "viewer" = "owner"): Draft => draftFrom(offeringsBusiness(), { role });
export const brandDraftAs = (role: "owner" | "viewer" = "owner"): Draft => draftFrom(brandBusiness(), { role });

export type OpenedOB = { view: View; api: ObApi; server: FakeServer };
export async function openOB(section: "Business Offerings" | "Brand Identity", opts: Omit<OpenOptions, "section" | "rawSection" | "fullUrl" | "server"> & { offering?: string } = {}): Promise<OpenedOB> {
  let api!: ObApi;
  const { offering, ...rest } = opts;
  const view = await openView({
    ...rest,
    draft: rest.snapshot ? undefined : (rest.draft ?? (section === "Brand Identity" ? brandDraftAs() : offeringsDraftAs())),
    section,
    fullUrl: { extra: offering ? { offering } : {} },
    server: (s) => void (api = installObApi(s)),
  });
  return { view, api, server: view.server };
}

// ---- finders ----------------------------------------------------------------------------------------------------------
export const storedById = (view: View, id: string): Entry => structuredClone((view.server.draft.entries as any[]).find((e) => e.id === id)) as Entry;
export const storedBrand = (view: View): Entry => structuredClone((view.server.draft.entries as any[]).find((e) => e.kind === "branding_and_style")) as Entry;
export const buttonsNamed = (view: View, name: string | RegExp) => view.byRole("button", name);
export const buttonOrNull = (view: View, name: string) => buttonsNamed(view, name)[0] ?? null;
export const mustButton = (view: View, name: string) => one(buttonsNamed(view, name), `exactly one button named "${name}"`);

const listOf = (view: View): HNode | undefined => view.all().find((n) => n.props["aria-label"] === "Business offerings");
/** The list buttons of the offerings (evidence controls are not). */
export const offeringButtons = (view: View) => {
  const list = listOf(view);
  return list ? view.byRole("button", undefined, list).filter((b) => !/evidence|sources/i.test(view.nameOf(b))) : [];
};
export const offeringButton = (view: View, title: string): HNode | null =>
  offeringButtons(view).find((b) => view.text(b).startsWith(title)) ?? null;
export const isCurrent = (n: HNode) => n.props["aria-current"] !== undefined && n.props["aria-current"] !== false && n.props["aria-current"] !== "false";
export const currentTitles = (view: View) => offeringButtons(view).filter(isCurrent).map((b) => view.text(b));
export const listTitles = (view: View) => offeringButtons(view).map((b) => view.text(b));
export async function selectOffering(view: View, title: string) {
  await click(view, must(offeringButton(view, title), `a list button for "${title}"`));
}
export function lastNavParam(name: string): string | null {
  const urls = navigations().filter((u) => u.includes(`${name}=`));
  const last = urls[urls.length - 1];
  return last ? new URL(last, "http://localhost/knowledge/view").searchParams.get(name) : null;
}
export const toastStatus = (view: View, pattern: RegExp) => view.byRole("status").find((s) => pattern.test(rawText(s))) ?? null;
/** The page's controls that only an editor has, for the read-only guards. */
export function editingControls(view: View) {
  return [
    ...view.byRole("button", /^(edit|add|remove|delete|undo)\b/i),
    ...view.all().filter((n) => n.props.title === "Click to edit"),
    ...view.byRole("textbox").filter((n) => String(n.props.type ?? "text") !== "hidden"),
  ];
}
