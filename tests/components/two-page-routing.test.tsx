// After sign-in there are two pages: /knowledge, the company list, and /knowledge/view, one company.
//  - /, /dashboard and /knowledge with a company redirect there, keeping every query parameter;
//  - /knowledge/view shows the Scrape & Build hub, or with a versionId that saved version;
//  - the sidebar links to both, and the Company tab goes back to /knowledge.
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDraft, COMPANY_ID, SNAPSHOT_ID, VERSIONS, snapshotFrom } from "../helpers/knowledge-view-fixtures";

const state = vi.hoisted(() => ({
  path: "/knowledge",
  search: "",
  summaries: null as unknown,
  draft: null as unknown,
  snapshot: null as unknown,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  usePathname: () => state.path,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  verifiedSession: async () => ({ client: {}, user: { id: "user-1" } }),
}));
vi.mock("@/server/company-summaries", () => ({
  readCompanySummaries: async () => {
    if (!state.summaries) {
      throw new Error("unavailable");
    }
    return state.summaries;
  },
}));
vi.mock("@/server/read-model", async (original) => ({
  ...(await original<typeof import("@/server/read-model")>()),
  readDraft: async () => state.draft,
}));
vi.mock("@/server/snapshots", () => ({
  readVersionSummaries: async () => VERSIONS,
  readSnapshot: async () => ({ payload: state.snapshot }),
}));
vi.mock("../../src/components/shared/ui", async (original) => ({
  ...(await original<typeof import("../../src/components/shared/ui")>()),
  useHydrated: () => true,
}));
vi.mock("../../src/components/editor/scrape-progress", () => ({ ScrapeProgress: () => "[scrape progress]" }));
import { withQuery } from "../../src/lib/query-string";
import { AppShell } from "../../src/components/shared/app-shell";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");
type Page = (props: { searchParams: Promise<Record<string, string | string[]>> }) => Promise<unknown>;
async function render(page: Promise<{ default: unknown }>, params: Record<string, string | string[]>) {
  const { default: Page } = await page;
  return renderToStaticMarkup((await (Page as Page)({ searchParams: Promise.resolve(params) })) as React.ReactElement);
}
const home = () => import("../../src/app/page");
const dashboard = () => import("../../src/app/(authenticated)/dashboard/page");
const knowledge = () => import("../../src/app/(authenticated)/knowledge/page");
const view = () => import("../../src/app/(authenticated)/knowledge/view/page");

beforeEach(() => {
  state.path = "/knowledge";
  state.search = "";
  state.summaries = { companies: [], nextCursor: null };
  state.draft = buildDraft();
  state.snapshot = snapshotFrom(buildDraft());
});

describe("withQuery", () => {
  it("keeps every parameter, each value of a repeated one, and drops undefined ones", () => {
    expect(withQuery("/knowledge", {})).toBe("/knowledge");
    expect(withQuery("/knowledge", { a: "1 2", b: ["x", "y"], c: undefined })).toBe("/knowledge?a=1+2&b=x&b=y");
  });
});

describe("redirects", () => {
  const params = { companyId: COMPANY_ID, section: "key-people", jobId: "job-1", tag: ["a", "b"] };
  const query = `companyId=${COMPANY_ID}&section=key-people&jobId=job-1&tag=a&tag=b`;

  it("/ goes to /knowledge with its parameters", async () => {
    await expect(render(home(), {})).rejects.toThrow(/^redirect:\/knowledge$/);
    await expect(render(home(), { next: "x" })).rejects.toThrow(/^redirect:\/knowledge\?next=x$/);
  });

  it("/dashboard goes to /knowledge with its parameters", async () => {
    await expect(render(dashboard(), {})).rejects.toThrow(/^redirect:\/knowledge$/);
    await expect(render(dashboard(), { cursor: "c1", q: "a&b" })).rejects.toThrow(/^redirect:\/knowledge\?cursor=c1&q=a%26b$/);
  });

  it("/knowledge with a company goes to /knowledge/view with every parameter", async () => {
    await expect(render(knowledge(), params)).rejects.toThrow(`redirect:/knowledge/view?${query}`);
    const legacy = { companyId: COMPANY_ID, category: "key_person", entryId: "e1" };
    await expect(render(knowledge(), legacy)).rejects.toThrow(`redirect:/knowledge/view?companyId=${COMPANY_ID}&category=key_person&entryId=e1`);
  });

  it("/knowledge/view without a valid company goes back to /knowledge", async () => {
    await expect(render(view(), {})).rejects.toThrow(/^redirect:\/knowledge$/);
    await expect(render(view(), { companyId: "not-a-uuid" })).rejects.toThrow(/^redirect:\/knowledge$/);
  });
});

describe("/knowledge", () => {
  it("shows the company dashboard", async () => {
    state.summaries = {
      companies: [{ id: COMPANY_ID, name: "Harbor Coffee", website_url: "https://example.com", draft_generation: 1, archived_at: null, role: "owner", latestJob: null, latestVersion: null }],
      nextCursor: null,
    };
    const html = await render(knowledge(), {});
    expect(text(html)).toContain("Your knowledge workspace");
    expect(text(html)).toContain("Harbor Coffee");
    expect(html).toContain(`href="/knowledge/view?companyId=${COMPANY_ID}"`);
  });

  it("keeps the dashboard's error notice", async () => {
    state.summaries = null;
    expect(text(await render(knowledge(), {}))).toContain("Your companies are temporarily unavailable. Refresh to try again.");
  });
});

describe("/knowledge/view", () => {
  it("shows the Scrape & Build hub for the draft without a versionId", async () => {
    const page = text(await render(view(), { companyId: COMPANY_ID }));
    expect(page).toContain("Save knowledge version");
    expect(page).toContain("[scrape progress]");
    expect(page).not.toContain("read only");
  });

  it("versionId=draft (the version selector's Current draft) shows the draft read only, as before", async () => {
    const html = await render(view(), { companyId: COMPANY_ID, versionId: "draft" });
    expect(text(html)).not.toContain("Save knowledge version");
    expect(text(html)).not.toContain("[scrape progress]");
    expect(html).toContain('name="versionId" value="draft"');
  });

  it("maps a link from before the hub (category and entryId) to its section", async () => {
    const html = await render(view(), { companyId: COMPANY_ID, category: "key_person" });
    expect(text(/aria-selected="true"[^>]*>(.*?)<\/li>/s.exec(html)?.[1] ?? "").trim()).toBe("Key People");
  });

  it("shows a saved version, read only, with a versionId", async () => {
    const html = await render(view(), { companyId: COMPANY_ID, versionId: SNAPSHOT_ID });
    expect(html).toMatch(/read only/);
    expect(text(html)).not.toContain("Save knowledge version");
    expect(html).toContain(`/api/companies/${COMPANY_ID}/versions/${SNAPSHOT_ID}/download`);
  });

  it("refuses a versionId that is not a saved version's id", async () => {
    expect(text(await render(view(), { companyId: COMPANY_ID, versionId: "nonsense" }))).toContain("This saved version is unavailable.");
  });

  it("the Company tab is a link back to /knowledge, on the hub and on a saved version", async () => {
    for (const params of [{ companyId: COMPANY_ID } as Record<string, string>, { companyId: COMPANY_ID, versionId: SNAPSHOT_ID }]) {
      const tabs = [...(await render(view(), params)).matchAll(/<[^>]*class="knowledge-view__tab"[^>]*>Company<\/\w+>/g)].map((m) => m[0]);
      expect(tabs, JSON.stringify(params)).toEqual(['<a href="/knowledge" class="knowledge-view__tab">Company</a>']);
    }
  });
});

describe("sidebar", () => {
  const links = (html: string) =>
    [...html.matchAll(/<a href="([^"]*)" title="([^"]*)"(?: aria-current="page")?[^>]*class="app-shell__link( app-shell__link--active)?"/g)].map(
      (m) => ({ href: m[1].replaceAll("&amp;", "&"), label: m[2], active: Boolean(m[3]) }),
    );
  const shell = () => renderToStaticMarkup(<AppShell>page</AppShell>);

  it("on /knowledge: Companies, active; the logo goes to /knowledge", () => {
    expect(links(shell())).toEqual([{ href: "/knowledge", label: "Companies", active: true }]);
    expect(shell()).toMatch(/<a href="\/knowledge" aria-label="[^"]* home"/);
  });

  it("on /knowledge/view: Companies, and Company workspace for this company, active", () => {
    state.path = "/knowledge/view";
    state.search = `companyId=${COMPANY_ID}`;
    expect(links(shell())).toEqual([
      { href: "/knowledge", label: "Companies", active: false },
      { href: `/knowledge/view?companyId=${COMPANY_ID}`, label: "Company workspace", active: true },
    ]);
  });
});
