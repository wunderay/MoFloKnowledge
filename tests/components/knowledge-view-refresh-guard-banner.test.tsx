// Acceptance, Quest Q19 refresh-draft-guard, criteria C5 and C6 (owner findings on PRs #13, #19, #20, #21).
//
// When the draft cannot be read after a save, the view says "Saved. Reload to see the latest <links|changes>."
// and offers Reload.
//  - C6: the word names the LATEST failure: "links" after an import, "+ Add page" or a people action, "changes"
//    after an inline edit, whatever an earlier failure said before it was recovered.
//  - C5: the banner's own Reload is a read the person asked for. It is not cut off at the short limit that
//    applies to the read that follows a save (timing.reread, 8 s): a slow read that succeeds recovers the view.
//
// DECISION (C5): the tests shorten timing.reread to 100 ms and let the Reload answer 500 ms later; a Reload
//   limit that is separate from timing.reread (or none) passes, one derived from it by a factor below 5 does not.
// DECISION (C5, the save's read): the read right after a save keeps the timing.reread limit (the existing
//   recovery tests lock that); only the banner's Reload is exempt.
import { afterEach, describe, expect, it, vi } from "vitest";
import { timing } from "../../src/components/knowledge-view/timing";
import {
  ADD_PAGE,
  FAILURE_TEXT,
  IMPORT,
  INLINE,
  PERSON,
  STALE_NOTICE,
  openGuarded,
  reloadButtons,
  sleep,
  staleSentence,
  switchTo,
  type Driver,
} from "../helpers/knowledge-view-refresh-guard";
import type { View } from "../helpers/knowledge-view-site-all-runtime";
import { disabled, one } from "../helpers/knowledge-view-inline-edit";
import { click } from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => {
  timing.reread = 8000;
  timing.fresh = 12000;
});

async function settleAll(view: View) {
  await view.settle();
  await sleep(30);
  await view.settle();
}
const reload = (view: View) => one(reloadButtons(view), "the banner's Reload button");

describe("C6 the stale notice names the latest failure", () => {
  const LINKS_DRIVERS: Driver[] = [ADD_PAGE, IMPORT, PERSON];

  it.each(LINKS_DRIVERS.map((d) => [d.name, d] as const))("after an inline failure was recovered, a failed %s says 'links'", async (_name, driver) => {
    const { view, reads } = await openGuarded(INLINE.sectionId);
    reads.failing = true;
    await INLINE.act(view);
    await settleAll(view);
    expect(staleSentence(view), "an inline edit that cannot be read back says 'changes'").toBe("changes");

    reads.failing = false;
    await click(view, reload(view));
    await settleAll(view);
    expect(view.text(), "recovered").not.toMatch(STALE_NOTICE);
    expect(INLINE.shows(view)).toBe(true);

    await switchTo(view, driver.sectionLabel);
    reads.failing = true;
    await driver.act(view);
    await settleAll(view);
    expect(view.text(), "the notice is shown").toMatch(STALE_NOTICE);
    expect(staleSentence(view), `a ${driver.name} that cannot be read back says 'links', not what an earlier failure said`).toBe("links");
  });

  it.each(LINKS_DRIVERS.map((d) => [d.name, d] as const))("after a failed %s was recovered, a failed inline edit says 'changes'", async (_name, driver) => {
    const { view, reads } = await openGuarded(driver.sectionId);
    reads.failing = true;
    await driver.act(view);
    await settleAll(view);
    expect(staleSentence(view)).toBe("links");

    reads.failing = false;
    await click(view, reload(view));
    await settleAll(view);
    expect(view.text()).not.toMatch(STALE_NOTICE);

    await switchTo(view, INLINE.sectionLabel);
    reads.failing = true;
    await INLINE.act(view);
    await settleAll(view);
    expect(staleSentence(view)).toBe("changes");
  });

  it("a Reload that fails again keeps the wording of the failure it belongs to", async () => {
    const { view, reads } = await openGuarded(INLINE.sectionId);
    reads.failing = true;
    await INLINE.act(view);
    await settleAll(view);
    await click(view, reload(view));
    await settleAll(view);
    expect(staleSentence(view)).toBe("changes");
    expect(disabled(view, reload(view)), "Reload can be pressed again").toBe(false);
  });
});

describe("C5 the banner's Reload is not cut off at the save re-read limit", () => {
  it.each([
    ["inline edit", INLINE],
    ["add page", ADD_PAGE],
    ["people action", PERSON],
  ] as const)("a slow Reload after a failed %s that succeeds recovers the view", async (_name, driver) => {
    timing.reread = 100;
    const { view, reads } = await openGuarded(driver.sectionId);
    reads.failing = true;
    await driver.act(view);
    await settleAll(view);
    expect(view.text()).toMatch(STALE_NOTICE);
    expect(driver.ready(view), "blocked until a Reload succeeds").toBe(false);

    reads.failing = false;
    reads.holdNext();
    await click(view, reload(view));
    expect(reads.drafts, "the Reload is reading").toHaveLength(1);
    await sleep(500); // five times the save re-read limit
    await view.settle();
    expect(view.text(), "still waiting, not given up").not.toMatch(/not read in time/i);
    const button = view.byRole("button", /^reload/i)[0];
    expect(button && disabled(view, button), "Reload shows it is working").toBe(true);

    reads.drafts[0].release();
    await settleAll(view);
    expect(view.text(), "the notice is gone").not.toMatch(STALE_NOTICE);
    expect(view.text()).not.toMatch(FAILURE_TEXT);
    expect(driver.shows(view), "the saved change is shown").toBe(true);
    expect(driver.ready(view), "editing is available again").toBe(true);
  });

  it("a Reload whose read fails says so and can be pressed again to recover", async () => {
    timing.reread = 100;
    const { view, reads } = await openGuarded(INLINE.sectionId);
    reads.failing = true;
    await INLINE.act(view);
    await settleAll(view);
    reads.failing = false;
    reads.holdNext();
    await click(view, reload(view));
    await sleep(300);
    reads.drafts[0].fail("Draft store is down.");
    await settleAll(view);
    expect(view.text(), "still stale").toMatch(STALE_NOTICE);
    expect(view.text()).toMatch(/draft store is down/i);

    await click(view, reload(view));
    await settleAll(view);
    expect(view.text()).not.toMatch(STALE_NOTICE);
    expect(INLINE.shows(view)).toBe(true);
  });

  it("the read that follows a save is still limited by timing.reread (existing behaviour)", async () => {
    timing.reread = 150;
    const { view, reads } = await openGuarded(INLINE.sectionId);
    reads.holdNext();
    await INLINE.act(view);
    await sleep(500);
    await settleAll(view);
    expect(view.text(), "a read that does not settle in time leaves the view stale").toMatch(/saved\. reload to see the latest changes/i);
    expect(view.text()).toMatch(/not read in time/i);
    expect(view.server.writes, "the save stands and is not sent again").toHaveLength(1);
  });
});
