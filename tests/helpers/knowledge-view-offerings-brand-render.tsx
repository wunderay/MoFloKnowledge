// Renders /knowledge/view like tests/helpers/knowledge-view-render.tsx, with one
// extra URL parameter: `offering` (the selected offering's entry id). Both the
// page's `searchParams` and next/navigation's useSearchParams carry it, so an
// implementation may read it on either side of the server/client boundary.
// Import this helper OR knowledge-view-render, never both in one test file.
import React from "react";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
import type { KnowledgeBaseExport } from "../../src/contracts";
import type { Draft } from "./knowledge-view-fixtures";
import { VERSIONS } from "./knowledge-view-fixtures";
import { buildDraft } from "./knowledge-view-fixtures";
import { parse, selectorItems, type Page } from "./knowledge-view-dom";

const state = vi.hoisted(() => ({
  search: "",
  draft: null as unknown,
  snapshot: null as unknown,
  versions: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  usePathname: () => "/knowledge/view",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
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
vi.mock("@/server/read-model", () => ({ readDraft: async () => state.draft }));
vi.mock("@/server/snapshots", () => ({
  readVersionSummaries: async () => state.versions,
  readSnapshot: async () => ({ payload: state.snapshot }),
}));
vi.mock("@/server/authorize", () => ({}));
vi.mock("server-only", () => ({}));

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
  for (const each of ids)
    if (!PROVIDED.has(each)) vi.doMock(each, () => import(/* @vite-ignore */ file));
}

export type OBRenderOptions = {
  section?: string;
  /** Value for the `offering` URL parameter; omitted when undefined. */
  offering?: string;
  draft?: Draft;
  snapshot?: { payload: KnowledgeBaseExport; versionId: string };
};

export async function renderOB(opts: OBRenderOptions): Promise<string> {
  const companyId = (opts.snapshot?.payload.company_id ?? opts.draft?.company.id)!;
  const query = new URLSearchParams();
  if (opts.section !== undefined) query.set("section", opts.section);
  if (opts.offering !== undefined) query.set("offering", opts.offering);
  state.search = query.toString();
  // These read-only (Q3) tests look at the view as a viewer sees it: an owner's draft edits in place (Quest offerings-brand-edit,
  // which has its own tests), and its controls are not part of what they check.
  state.draft = opts.draft ? { ...opts.draft, company: { ...opts.draft.company, role: "viewer" } } : null;
  state.snapshot = opts.snapshot?.payload ?? null;
  state.versions = VERSIONS;
  const { default: ViewPage } = await import("../../src/app/(authenticated)/knowledge/view/page");
  const element = await ViewPage({
    searchParams: Promise.resolve({
      companyId,
      versionId: opts.snapshot ? opts.snapshot.versionId : "draft",
      ...(opts.section === undefined ? {} : { section: opts.section }),
      ...(opts.offering === undefined ? {} : { offering: opts.offering }),
    }),
  } as never);
  return renderToStaticMarkup(element as React.ReactElement);
}

/** The identifier the section selector submits for `label` (read from the rendered selector). */
export async function sectionIdOf(label: "Business Offerings" | "Brand Identity"): Promise<string> {
  const page = parse(await renderOB({ draft: buildDraft() }));
  const item = selectorItems(page).find((i) => i.label === label);
  if (!item || !item.value) throw new Error(`the "Knowledge section" selector should list "${label}" with an identifier`);
  return item.value;
}

export async function openOfferings(opts: Omit<OBRenderOptions, "section"> = {}): Promise<Page> {
  return parse(await renderOB({ ...opts, section: await sectionIdOf("Business Offerings") }));
}
export async function openBrand(opts: Omit<OBRenderOptions, "section" | "offering"> = {}): Promise<Page> {
  return parse(await renderOB({ ...opts, section: await sectionIdOf("Brand Identity") }));
}
