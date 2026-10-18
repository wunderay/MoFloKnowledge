// Acceptance: while the company's crawl is queued or running, a section with no data yet shows a loading
// skeleton instead of its empty state; sections with data show the data; once the crawl has ended the
// normal empty state returns and no skeleton remains.
//
// The crawl status is supplied on both channels the app already has for it (the draft's latest job and
// the sources inventory job), so the tests do not depend on which of them the view reads.
import { describe, expect, it, vi } from "vitest";
import { openView, type FakeServer, type View } from "../helpers/knowledge-view-site-all-runtime";
import { emptySiteDraft, siteDraft, LINKS } from "../helpers/knowledge-view-site-all-fixtures";

vi.setConfig({ testTimeout: 30_000 });

type Draft = ReturnType<typeof siteDraft>;
const EMPTY_TEXT = /No internal links yet/i;

function withJob(draft: Draft, status: string): { draft: Draft; server: (server: FakeServer) => void } {
  const job = { id: "00000000-0000-4000-8000-0000000c0001", status, progress: {}, created_at: "2026-10-16T09:00:00.000Z" };
  const company = { ...draft.company, latestJob: job } as Draft["company"];
  return {
    draft: { ...draft, company },
    server: (server) => {
      server.sources = { ...server.sources, job: { ...job, createdAt: job.created_at, updatedAt: job.created_at, documentLimit: 12, errors: [], limitsReached: [] } };
    },
  };
}
const open = (draft: Draft, status: string): Promise<View> => {
  const given = withJob(draft, status);
  return openView({ section: "Site Knowledge", draft: given.draft, server: given.server });
};
const busy = (view: View) => view.page().$('[aria-busy="true"]');

describe("crawl loading skeleton", () => {
  it("shows a busy skeleton, not the empty state, while the crawl runs and the section has no data", async () => {
    for (const status of ["queued", "crawling"]) {
      const view = await open(emptySiteDraft(), status);
      expect(busy(view).length, `status ${status}: aria-busy region`).toBeGreaterThan(0);
      expect(view.text(), `status ${status}`).toMatch(/Loading[^.]*(site|link)/i);
      expect(view.text(), `status ${status}`).not.toMatch(EMPTY_TEXT);
    }
  });

  it("shows the data and no skeleton while the crawl runs and the section has data", async () => {
    const view = await open(siteDraft(), "crawling");
    for (const link of LINKS) {
      expect(view.text()).toContain(link.title);
    }
    expect(busy(view).length).toBe(0);
    expect(view.text()).not.toMatch(/Loading (site|internal)/i);
  });

  it("shows the normal empty state and no skeleton once the crawl has ended", async () => {
    for (const status of ["succeeded", "partial", "failed"]) {
      const view = await open(emptySiteDraft(), status);
      expect(view.text(), `status ${status}`).toMatch(EMPTY_TEXT);
      expect(busy(view).length, `status ${status}`).toBe(0);
      expect(view.text(), `status ${status}`).not.toMatch(/Loading (site|internal)/i);
    }
  });
});
