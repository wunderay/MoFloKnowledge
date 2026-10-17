// Quest Q19 follow-up: a superseded draft read is aborted when it is superseded, and a Reload that never
// answers is bounded by timing.reload (its button comes back with the failure message).
import { afterEach, describe, expect, it, vi } from "vitest";
import { timing } from "../../src/components/knowledge-view/timing";
import {
  ADD_PAGE,
  FAILURE_TEXT,
  PERSON,
  INLINE,
  STALE_NOTICE,
  SNAPSHOT_ID,
  openGuarded,
  reloadButtons,
  selectVersion,
  sleep,
} from "../helpers/knowledge-view-refresh-guard";
import { click, disabled, one } from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => {
  timing.reread = 8000;
  timing.reload = 60000;
  timing.fresh = 12000;
});

describe("a read superseded by navigation is aborted at once", () => {
  it("navigating to a saved version aborts the pending read", async () => {
    const { view, reads } = await openGuarded(ADD_PAGE.sectionId);
    reads.holdNext();
    await ADD_PAGE.act(view);
    expect(reads.drafts[0]!.state).toBe("pending");
    await selectVersion(view, SNAPSHOT_ID);
    expect(reads.drafts[0]!.state).toBe("aborted");
  });
});

describe("a Reload that never answers", () => {
  it("is cut off at timing.reload and the button comes back with the failure message", async () => {
    timing.reload = 300;
    const { view, reads } = await openGuarded(INLINE.sectionId);
    reads.failing = true;
    await INLINE.act(view);
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(view.text()).toMatch(STALE_NOTICE);
    reads.failing = false;
    reads.holdNext();
    await click(view, one(reloadButtons(view), "Reload"));
    await view.settle();
    await sleep(500);
    await view.settle();
    expect(view.text(), "still stale, with the reason").toMatch(/was not read in time/i);
    const button = one(view.byRole("button", /^reload$/i), "Reload is back");
    expect(disabled(view, button)).toBe(false);
  });
});

// A navigation load of the draft and a post-save refresh are ordered by the same epoch: the one started last wins.
describe("a navigation load and a post-save refresh", () => {
  async function heldSave() {
    const opened = await openGuarded(PERSON.sectionId);
    const { view } = opened;
    const base = globalThis.fetch;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    vi.stubGlobal("fetch", async (input: never, init?: { method?: string }) => {
      if ((init?.method ?? "GET").toUpperCase() === "POST") await gate;
      return (base as (i: never, n?: unknown) => Promise<unknown>)(input, init);
    });
    await PERSON.act(view);
    return { ...opened, open };
  }

  it("an older navigation load released after the newer post-save refresh is ignored", async () => {
    const { view, reads, open } = await heldSave();
    await selectVersion(view, SNAPSHOT_ID);
    reads.holdNext();
    await selectVersion(view, "draft");
    expect(reads.drafts).toHaveLength(1);
    open();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(PERSON.shows(view), "the refresh after the save shows the new person").toBe(true);
    reads.drafts[0]!.release();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(PERSON.shows(view), "the older navigation load did not take the person away").toBe(true);
    expect(view.text()).not.toMatch(STALE_NOTICE);
  });

  it("an older navigation load that fails after the newer refresh leaves nothing stuck", async () => {
    const { view, reads, open } = await heldSave();
    await selectVersion(view, SNAPSHOT_ID);
    reads.holdNext();
    await selectVersion(view, "draft");
    open();
    await view.settle();
    await sleep(30);
    await view.settle();
    reads.drafts[0]!.fail();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(PERSON.shows(view)).toBe(true);
    expect(view.text()).not.toMatch(FAILURE_TEXT);
    expect(PERSON.ready(view)).toBe(true);
  });

  it("a post-save refresh released after a newer navigation load is ignored", async () => {
    const { view, reads, open } = await heldSave();
    reads.holdNext();
    open();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(reads.drafts).toHaveLength(1);
    await selectVersion(view, SNAPSHOT_ID);
    await selectVersion(view, "draft");
    reads.drafts[0]!.fail();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(view.text(), "no stale notice from the superseded refresh").not.toMatch(STALE_NOTICE);
    expect(PERSON.shows(view)).toBe(true);
  });
});
