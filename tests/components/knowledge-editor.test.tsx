// The Scrape & Build hub at /knowledge/view.
//  - Without a valid company it goes back to the company list at /knowledge.
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
// The server render is what a hydrated owner first sees: editing controls are on.
vi.mock("../../src/components/shared/ui", async (original) => ({
  ...(await original<typeof import("../../src/components/shared/ui")>()),
  useHydrated: () => true,
}));
// The crawl's progress display belongs to another change; the hub only places it.
vi.mock("../../src/components/editor/scrape-progress", () => ({ ScrapeProgress: () => "[scrape progress]" }));
import { SectionView } from "../../src/components/knowledge-view/section-view";
import { evidenceDraft } from "../helpers/knowledge-view-evidence";

async function renderHub(params: Record<string, string>, draft?: Draft) {
  state.draft = draft ?? null;
  const { default: ViewPage } = await import("../../src/app/(authenticated)/knowledge/view/page");
  const element = await ViewPage({ searchParams: Promise.resolve(params) } as never);
  return renderToStaticMarkup(element as React.ReactElement);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");

describe("/knowledge/view without a company", () => {
  it("goes back to the company list when the company id is missing or invalid", async () => {
    await expect(renderHub({})).rejects.toThrow("redirect:/knowledge");
    await expect(renderHub({ companyId: "not-a-uuid", section: "brand" })).rejects.toThrow(/^redirect:\/knowledge$/);
  });
});

describe("/knowledge/view with a company", () => {
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
      expect(html, section).not.toMatch(/href="\/knowledge(\/view)?\?companyId=[^"]*category=/);
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

/** buildDraft with a second key person, so that opening one of them is not the default (the first). */
function twoPeople(): { draft: Draft; second: { entryId: string; personId: string } } {
  const draft = buildDraft();
  const first = draft.entries.find((entry) => entry.kind === "key_person")!;
  const personId = "00000000-0000-4000-8000-00000000b0b2";
  const entryId = "00000000-0000-4000-8000-00000000e0b2";
  draft.entries.push({ ...structuredClone(first), id: entryId, content: { ...(structuredClone(first.content) as object), id: personId, name: "Jonas Berg" } } as never);
  return { draft, second: { entryId, personId } };
}
const selectedPerson = (html: string) => text(/knowledge-view__person--selected[^>]*>(.*?)<\/li>/s.exec(html)?.[1] ?? "");
const selectedSection = (html: string) => text(/aria-selected="true"[^>]*>(.*?)<\/li>/s.exec(html)?.[1] ?? "").trim();

describe("links from before the hub (category and entryId)", () => {
  it("category=key_person with an entryId selects Key People and opens that person, by entry id or person id", async () => {
    const { draft, second } = twoPeople();
    for (const entryId of [second.entryId, second.personId]) {
      const html = await renderHub({ companyId: COMPANY_ID, category: "key_person", entryId }, draft);
      expect(selectedSection(html), entryId).toBe("Key People");
      expect(selectedPerson(html), entryId).toContain("Jonas Berg");
    }
  });

  it("maps every category to its section; an explicit section wins", async () => {
    const expected: Record<string, string> = {
      company_foundation: "General Info",
      positioning: "General Info",
      market_and_customers: "Customers & Industry",
      online_presence: "Sales & Marketing",
      branding_and_style: "Brand Identity",
      offering: "Business Offerings",
      key_person: "Key People",
      site_links: "Site Knowledge",
    };
    for (const [category, label] of Object.entries(expected)) {
      expect(selectedSection(await renderHub({ companyId: COMPANY_ID, category }, buildDraft())), category).toBe(label);
    }
    expect(selectedSection(await renderHub({ companyId: COMPANY_ID, category: "offering", section: "brand" }, buildDraft()))).toBe("Brand Identity");
    expect(selectedSection(await renderHub({ companyId: COMPANY_ID, category: "nonsense" }, buildDraft()))).toBe("General Info");
  });
});

describe("/knowledge/view while the crawl runs", () => {
  const withJob = (draft: Draft, status: string) => {
    (draft.company as Record<string, unknown>).latestJob = { status };
    return draft;
  };

  it("shows a loading skeleton in each section without data while the job is queued or running", async () => {
    for (const status of ["queued", "validating", "crawling", "extracting"]) {
      for (const [section, label] of [["general", "General Info"], ["key-people", "Key People"], ["offerings", "Business Offerings"]]) {
        const html = await renderHub({ companyId: EMPTY_COMPANY_ID, section }, withJob(buildEmptyDraft(), status));
        expect(html, `${status} ${section}`).toMatch(/aria-busy="true"/);
        expect(text(html), `${status} ${section}`).toContain(`Loading ${label}…`);
      }
    }
  });

  it("shows the real content once the job has ended", async () => {
    for (const status of ["succeeded", "failed"]) {
      const empty = await renderHub({ companyId: EMPTY_COMPANY_ID }, withJob(buildEmptyDraft(), status));
      expect(text(empty), status).not.toContain("Loading General Info…");
      expect(text(empty), status).toContain("+ Add main address");
    }
    // A section that already has data shows it even while the crawl still runs.
    const running = await renderHub({ companyId: COMPANY_ID, section: "key-people" }, withJob(buildDraft(), "crawling"));
    expect(text(running)).not.toContain("Loading Key People…");
    expect(text(running)).toContain("Maya Okafor");
  });
});
