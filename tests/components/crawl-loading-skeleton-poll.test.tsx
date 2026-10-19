// While a crawl runs the view re-reads the draft; a later edit must quote the generation of the latest read,
// because finishing the crawl bumps it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { editAndEnter } from "../helpers/knowledge-view-inline-edit";
import { COMPANY_ID, draftFrom } from "../helpers/knowledge-view-fixtures";
import { brandBusiness } from "../helpers/knowledge-view-offerings-brand-fixtures";
import { openView } from "../helpers/knowledge-view-site-all-runtime";
import { timing } from "../../src/components/knowledge-view/timing";

vi.setConfig({ testTimeout: 30_000 });
const poll = timing.poll;
afterEach(() => {
  timing.poll = poll;
});

describe("crawl polling", () => {
  it("sends the newer generation in an edit made after a poll", async () => {
    timing.poll = 20;
    const draft = draftFrom(brandBusiness());
    const job = { id: "00000000-0000-4000-8000-0000000c0001", status: "crawling", progress: {}, created_at: "2026-10-16T09:00:00.000Z" };
    draft.company = { ...draft.company, latestJob: job } as typeof draft.company;
    const view = await openView({ section: "Brand Identity", draft });
    view.server.draft.draftGeneration = draft.draftGeneration + 1;
    view.server.draft.company.latestJob = { ...job, status: "succeeded" };
    await new Promise((resolve) => setTimeout(resolve, 150));
    await view.settle();
    await editAndEnter(view, { label: "Display name" }, "Harbor & Pine Roasters");
    const patches = view.server.requests.filter((r) => r.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe(`/api/companies/${COMPANY_ID}`);
    expect(patches[0].body.expectedGeneration).toBe(draft.draftGeneration + 1);
  });
});
