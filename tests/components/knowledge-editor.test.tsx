// The Scrape & Build hub at /knowledge.
//  - Without a company it starts with a create form: company name and website. Creating the company starts the crawl.
//  - With a company it shows the draft as the MoFlo reference does: the seven sections (no "All sections"), each value
//    edited in place, no evidence layer, no per-category Save draft / Approve / Reject / History, and one
//    "Save knowledge version".
// The page runs as the server renders it (its data layer replaced by fixtures); assertions are on visible text and names.
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildDraft, buildEmptyDraft, COMPANY_ID, EMPTY_COMPANY_ID, type Draft } from "../helpers/knowledge-view-fixtures";

const state = vi.hoisted(() => ({ draft: null as unknown }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/knowledge",
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
// The server render is what a hydrated owner first sees: editing controls are on.
vi.mock("../../src/components/shared/ui", async (original) => ({
  ...(await original<typeof import("../../src/components/shared/ui")>()),
  useHydrated: () => true,
}));
// The crawl's progress display belongs to another change; the hub only places it.
vi.mock("../../src/components/editor/scrape-progress", () => ({ ScrapeProgress: () => "[scrape progress]" }));
import { nameProblem, websiteProblem } from "../../src/components/editor/create-company";
import { SectionView } from "../../src/components/knowledge-view/section-view";
import { evidenceDraft } from "../helpers/knowledge-view-evidence";

async function renderHub(params: Record<string, string>, draft?: Draft) {
  state.draft = draft ?? null;
  const { default: KnowledgePage } = await import("../../src/app/(authenticated)/knowledge/page");
  const element = await KnowledgePage({ searchParams: Promise.resolve(params) } as never);
  return renderToStaticMarkup(element as React.ReactElement);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");

describe("/knowledge without a company", () => {
  it("shows the create form (name, website, one submit button) instead of the dashboard notice", async () => {
    const html = await renderHub({});
    expect(text(html)).toContain("Company name");
    expect(text(html)).toContain("Company website");
    expect(html).toMatch(/<input[^>]*name="name"/);
    expect(html).toMatch(/<input[^>]*name="website"[^>]*type="url"|<input[^>]*type="url"[^>]*name="website"/);
    expect(text(html)).toContain("Create company and start crawl");
    expect(text(html)).not.toContain("Select a company from the dashboard");
  });

  it("an invalid company id also opens the create form", async () => {
    expect(text(await renderHub({ companyId: "not-a-uuid" }))).toContain("Create company and start crawl");
  });
});

describe("create form checks", () => {
  it("the name is required, at most 200 characters, and not one of your companies (ignoring case and spaces)", () => {
    expect(nameProblem("   ", [])?.message).toBe("Enter the company name.");
    expect(nameProblem("x".repeat(201), [])?.message).toBe("Keep the company name to 200 characters or fewer.");
    expect(nameProblem("x".repeat(200), [])).toBeNull();
    expect(nameProblem("  lumen LEDGER ", [{ id: "c1", name: "Lumen Ledger" }])).toEqual({
      message: "You already have a company named “Lumen Ledger”.",
      id: "c1",
    });
    expect(nameProblem("Lumen Ledger", [{ id: "c1", name: "Harbor" }])).toBeNull();
  });

  it("the website must be a full public http(s) address", () => {
    expect(websiteProblem("")).toBe("Enter the company website.");
    expect(websiteProblem("company.com")).toBe("Enter the full website address, for example https://company.com.");
    expect(websiteProblem("ftp://company.com")).toBe("The website must start with http:// or https://.");
    expect(websiteProblem(["https://me", "pw@company.com"].join(":"))).toBe("Remove the user name or password from the website address.");
    expect(websiteProblem("https://company.com:8443")).toBe("Use the website's public address, without a port number.");
    expect(websiteProblem(" https://company.com/about ")).toBeNull();
    expect(websiteProblem("http://company.com:80")).toBeNull();
  });
});

describe("/knowledge with a company", () => {
  it("lists the seven sections of the reference, without All sections", async () => {
    const html = await renderHub({ companyId: COMPANY_ID }, buildDraft());
    const options = [...html.matchAll(/role="option"[^>]*>(.*?)<\/li>/g)].map((m) => text(m[1]).trim());
    expect(options).toEqual([
      "General Info",
      "Brand Identity",
      "Business Offerings",
      "Customers & Industry",
      "Sales & Marketing",
      "Key People",
      "Site Knowledge",
    ]);
  });

  it("has one Save (Save knowledge version) and none of the form editor's per-category controls", async () => {
    const page = text(await renderHub({ companyId: COMPANY_ID }, buildDraft()));
    expect(page.match(/Save knowledge version/g)).toHaveLength(1);
    for (const gone of ["Save draft", "Approve unchanged", "Save and approve", "Reject", "History", "Helpful tip", "fields checked", "Knowledge category"]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it("shows no evidence layer: the saved-version view's source controls and coverage notes are absent", async () => {
    const draft = evidenceDraft() as unknown as Draft;
    const evidence = /Sources|Not assessed|not checked|partial/i;
    // Control: the same draft in the saved-version view's section component shows its evidence.
    const viewer = renderToStaticMarkup(
      <SectionView section="general" companyId={COMPANY_ID} name="Harbor" entries={draft.entries as never} citationContext={draft.citationContext as never} />,
    );
    expect(viewer).toMatch(evidence);
    expect(await renderHub({ companyId: COMPANY_ID }, draft)).not.toMatch(evidence);
  });

  it("an empty company adds values in place: no + Add link back to a form editor", async () => {
    for (const section of ["general", "brand", "customers", "sales"]) {
      const html = await renderHub({ companyId: EMPTY_COMPANY_ID, section }, buildEmptyDraft());
      expect(html, section).not.toMatch(/href="\/knowledge\?companyId=[^"]*category=/);
    }
    const general = text(await renderHub({ companyId: EMPTY_COMPANY_ID }, buildEmptyDraft()));
    expect(general).toContain("+ Add main address");
  });

  it("opens the section named in the URL, and All sections falls back to General Info", async () => {
    expect(text(await renderHub({ companyId: COMPANY_ID, section: "key-people" }, buildDraft()))).toContain("Key People");
    const all = await renderHub({ companyId: COMPANY_ID, section: "all" }, buildDraft());
    expect(all).toMatch(/aria-selected="true"[^>]*>(<[^>]+>)*\s*General Info/);
  });

  it("keeps review behind Review changes: unreviewed entries can be approved or removed, and approved all at once", async () => {
    const draft = buildDraft();
    draft.entries[0].review_status = "unreviewed";
    draft.entries[1].review_status = "unreviewed";
    const html = await renderHub({ companyId: COMPANY_ID }, draft);
    const page = text(html);
    expect(page).toContain("Review changes (2 to review)");
    expect(page).toContain("Approve all 2");
    expect(html.match(/aria-label="Approve [^"]+"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Remove [^"]+ from future versions"/g)).toHaveLength(draft.entries.length);
  });

  it("a viewer sees the review list without its buttons", async () => {
    const draft = buildDraft();
    draft.company.role = "viewer";
    draft.entries[0].review_status = "unreviewed";
    const html = await renderHub({ companyId: COMPANY_ID }, draft);
    expect(text(html)).toContain("Review changes (1 to review)");
    expect(html).not.toMatch(/aria-label="Approve |from future versions"/);
  });

  it("places the website crawl below the results", async () => {
    expect(text(await renderHub({ companyId: COMPANY_ID }, buildDraft()))).toContain("[scrape progress]");
  });
});
