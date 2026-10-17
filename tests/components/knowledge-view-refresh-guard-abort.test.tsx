// Quest Q19 follow-up: a superseded draft read is aborted when it is superseded, and a Reload that never
// answers is bounded by timing.reload (its button comes back with the failure message).
import { afterEach, describe, expect, it, vi } from "vitest";
import { timing } from "../../src/components/knowledge-view/timing";
import {
  ADD_PAGE,
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
