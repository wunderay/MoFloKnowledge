// Renders /knowledge/view the way a visitor receives it: the server page runs
// (with its data layer replaced by fixtures) and the element it returns is
// rendered to static HTML. /knowledge/view shows a draft in the Scrape & Build
// hub, so the read-only draft view (KnowledgeViewer with versionId "draft") is
// rendered as that page rendered it before, from the same data. The selected section is supplied BOTH as the page's
// `section` search parameter (and, when given, `offering` / `person`) and through
// next/navigation's useSearchParams, so an implementation may read a URL parameter
// on either side of the boundary.
import type React from "react";
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
vi.mock("@/lib/supabase/server", () => ({
  verifiedSession: async () => ({ client: {}, user: { id: "user-1" } }),
}));
vi.mock("@/server/read-model", async (original) => ({
  ...(await original<typeof import("@/server/read-model")>()),
  readDraft: async () => state.draft,
}));
vi.mock("@/server/snapshots", () => ({
  readVersionSummaries: async () => state.versions,
  readSnapshot: async () => ({ payload: state.snapshot }),
}));
vi.mock("@/server/authorize", () => ({}));

export interface RenderOptions {
  /** Value for the `section` URL parameter; omitted when undefined. */
  section?: string;
  versions?: { id: string; version_number: number; created_at: string }[];
  draft?: Draft;
  snapshot?: { payload: KnowledgeBaseExport; versionId: string };
  mode?: "json" | "table";
  /** Value for the `offering` URL parameter; omitted when undefined. */
  offering?: string;
  /** Value for the `person` URL parameter; omitted when undefined. */
  person?: string;
  /** Render the draft as a viewer sees it (no editing controls). */
  asViewer?: boolean;
}

/** The full /knowledge/view page markup for the given URL state and data. */
export async function renderViewPage(opts: RenderOptions): Promise<string> {
  const companyId = (opts.snapshot?.payload.company_id ?? opts.draft?.company.id)!;
  const query = new URLSearchParams();
  for (const key of ["section", "offering", "person"] as const) {
    if (opts[key] !== undefined) {
      query.set(key, opts[key]);
    }
  }
  state.search = query.toString();
  state.draft =
    opts.draft && opts.asViewer ? { ...opts.draft, company: { ...opts.draft.company, role: "viewer" } } : (opts.draft ?? null);
  state.snapshot = opts.snapshot?.payload ?? null;
  state.versions = opts.versions ?? [];
  state.forcedMode = opts.mode ?? null;
  if (!opts.snapshot) {
    const { draftViewPage } = await import("./knowledge-view-draft-page");
    return renderToStaticMarkup(await draftViewPage({ companyId, section: opts.section, offering: opts.offering, person: opts.person }));
  }
  const { default: ViewPage } = await import(
    "../../src/app/(authenticated)/knowledge/view/page"
  );
  const element = await ViewPage({
    searchParams: Promise.resolve({
      companyId,
      versionId: opts.snapshot.versionId,
      ...(opts.section === undefined ? {} : { section: opts.section }),
      ...(opts.offering === undefined ? {} : { offering: opts.offering }),
      ...(opts.person === undefined ? {} : { person: opts.person }),
    }),
  } as never);
  return renderToStaticMarkup(element as React.ReactElement);
}

