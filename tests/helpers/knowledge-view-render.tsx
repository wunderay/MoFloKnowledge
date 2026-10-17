// Renders /knowledge/view the way a visitor receives it: the server page runs
// (with its data layer replaced by fixtures) and the element it returns is
// rendered to static HTML. The selected section is supplied BOTH as the page's
// `section` search parameter and through next/navigation's useSearchParams, so
// an implementation may read the URL parameter on either side of the boundary.
import React from "react";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
import type { Draft } from "./knowledge-view-fixtures";
import type { KnowledgeBaseExport } from "../../src/contracts";

const state = vi.hoisted(() => ({
  search: "",
  draft: null as unknown,
  snapshot: null as unknown,
  versions: [] as unknown[],
  forcedMode: null as string | null,
}));

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    // Lets a test open the viewer in another display mode: the viewer's mode
    // state starts at "profile" (its existing default value).
    useState: (initial: unknown) =>
      (real.useState as (v: unknown) => unknown[])(
        initial === "profile" && state.forcedMode ? state.forcedMode : initial,
      ),
  };
});
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
vi.mock("@/server/read-model", () => ({
  readDraft: async () => state.draft,
}));
vi.mock("@/server/snapshots", () => ({
  readVersionSummaries: async () => state.versions,
  readSnapshot: async () => ({ payload: state.snapshot }),
}));
vi.mock("@/server/authorize", () => ({}));
vi.mock("server-only", () => ({}));

// vitest.config.ts defines no "@/" alias, so every "@/..." specifier the page
// graph uses is pointed at its real file under src/. Registering the whole
// tree (not a hand-picked list) keeps the tests independent of which modules
// an implementation chooses to import.
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

export type RenderOptions = {
  /** Value for the `section` URL parameter; omitted when undefined. */
  section?: string;
  versions?: { id: string; version_number: number; created_at: string }[];
  draft?: Draft;
  snapshot?: { payload: KnowledgeBaseExport; versionId: string };
  mode?: "json" | "table";
};

/** The full /knowledge/view page markup for the given URL state and data. */
export async function renderViewPage(opts: RenderOptions): Promise<string> {
  const companyId = (opts.snapshot?.payload.company_id ?? opts.draft?.company.id)!;
  state.search = opts.section === undefined ? "" : `section=${encodeURIComponent(opts.section)}`;
  state.draft = opts.draft ?? null;
  state.snapshot = opts.snapshot?.payload ?? null;
  state.versions = opts.versions ?? [];
  state.forcedMode = opts.mode ?? null;
  const { default: ViewPage } = await import(
    "../../src/app/(authenticated)/knowledge/view/page"
  );
  const element = await ViewPage({
    searchParams: Promise.resolve({
      companyId,
      versionId: opts.snapshot ? opts.snapshot.versionId : "draft",
      ...(opts.section === undefined ? {} : { section: opts.section }),
    }),
  } as never);
  return renderToStaticMarkup(element as React.ReactElement);
}
