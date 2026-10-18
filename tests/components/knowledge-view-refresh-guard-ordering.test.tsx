// Refresh guard: the order in which draft reads answer.
//
// Two saves made one after the other each re-read the draft. The server answers them in the order it likes:
// the read that was started LAST decides what the page shows. An older read that finishes after a newer one
// is dropped; it never puts older entries over newer ones, and when it fails it does not mark a page stale
// that a newer read has just refreshed.
//
// Which read is "latest": the one whose request was sent last. The tests start the second save
//   only after the first one's read is on its way, so "sent last" is unambiguous.
// What is checked: after both answers have arrived, in either order, the page shows what BOTH
//   saves wrote; no save is left "Saving…"; no dialog is left open; no stale notice is shown; nothing is
//   blocked. When the older answer comes first, both answers are applied in turn (the last one is the newest).
// An ignored read is not a failure: a save whose own read was dropped because a newer read exists
//   is finished like any other (its "Saved" shows, its dialog closes); nothing is sent again.
import { afterEach, describe, expect, it, vi } from "vitest";
import { timing } from "../../src/components/knowledge-view/timing";
import {
  ADD_PAGE,
  FAILURE_TEXT,
  IMPORT,
  INLINE,
  INLINE_STORY,
  PERSON,
  STALE_NOTICE,
  openGuarded,
  sleep,
  switchTo,
  type Driver,
  type Opened,
} from "../helpers/knowledge-view-refresh-guard";
import { holdTimeouts } from "../helpers/manual-timers";
import { LEGAL, alertText, editAndEnter, statusText, stored } from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });
/** A delay no other timer uses: it marks the draft read's time limit so that the test can fire it by hand. */
const REREAD_LIMIT = 7_001;
afterEach(() => {
  timing.reread = 8000;
  timing.fresh = 12000;
});

/** First save `older`, then (with its read still on its way) `newer`: two reads are held, oldest first. */
async function twoSaves(older: Driver, newer: Driver): Promise<Opened> {
  const opened = await openGuarded(older.sectionId);
  const { view, reads } = opened;
  reads.holdNext();
  await older.act(view);
  expect(reads.drafts, "the older save's read is on its way").toHaveLength(1);
  if (newer.sectionId !== older.sectionId) {
    await switchTo(view, newer.sectionLabel);
  }
  reads.holdNext();
  await newer.act(view);
  expect(reads.drafts, "the newer save's read is on its way").toHaveLength(2);
  expect(reads.drafts.map((r) => r.state)).toEqual(["pending", "pending"]);
  return opened;
}
async function settleAll(view: Opened["view"]) {
  await view.settle();
  await sleep(30);
  await view.settle();
}
/** Nothing is left half done on the page. */
function expectFinished(view: Opened["view"]) {
  expect(view.text(), "no stale notice").not.toMatch(STALE_NOTICE);
  expect(view.text(), "no failure shown").not.toMatch(FAILURE_TEXT);
  expect(statusText(view), "no save is left saving").not.toMatch(/saving/i);
  expect(view.dialogs(), "no dialog is left open").toHaveLength(0);
}

const PAIRS: [Driver, Driver][] = [
  [INLINE, INLINE_STORY],
  [INLINE, ADD_PAGE],
  [INLINE, IMPORT],
  [INLINE, PERSON],
  [ADD_PAGE, INLINE],
  [IMPORT, INLINE],
  [PERSON, INLINE],
];
const title = ([older, newer]: [Driver, Driver]) => `${older.name} then ${newer.name}`;

describe.each(PAIRS.map((pair) => [title(pair), ...pair] as const))("%s", (_name, older, newer) => {
  it("the read started last wins: the older read finishing later is ignored", async () => {
    const { view, reads } = await twoSaves(older, newer);
    reads.drafts[1].release();
    await settleAll(view);
    expect(newer.shows(view), "the newer read shows the newer save").toBe(true);
    reads.drafts[0].release();
    await settleAll(view);
    expect(newer.shows(view), "the older answer did not take the newer save away").toBe(true);
    await switchTo(view, older.sectionLabel);
    expect(older.shows(view), "and the older save is still shown").toBe(true);
    expectFinished(view);
  });

  // Answers in the order they were asked
  it("answers in the order they were asked: both saves are shown", async () => {
    const { view, reads } = await twoSaves(older, newer);
    reads.drafts[0].release();
    await settleAll(view);
    reads.drafts[1].release();
    await settleAll(view);
    expect(newer.shows(view)).toBe(true);
    await switchTo(view, older.sectionLabel);
    expect(older.shows(view)).toBe(true);
    expectFinished(view);
  });

  // A superseded read that fails does not make a freshly read page stale
  it("an older read that fails after the newer one succeeded leaves no stale notice and nothing blocked", async () => {
    const { view, reads } = await twoSaves(older, newer);
    reads.drafts[1].release();
    await settleAll(view);
    reads.drafts[0].fail();
    await settleAll(view);
    expect(newer.shows(view), "the newer content stays").toBe(true);
    expect(newer.ready(view), "nothing is blocked").toBe(true);
    await switchTo(view, older.sectionLabel);
    expect(older.shows(view)).toBe(true);
    expect(older.ready(view), "nothing is blocked there either").toBe(true);
    expectFinished(view);
  });

  // ... and neither does one that runs out of time
  it("an older read that runs out of time after the newer one succeeded leaves no stale notice", async () => {
    // Both reads' time limits are held, so the older one runs out exactly when the test says, not when the machine does.
    const { held } = holdTimeouts([REREAD_LIMIT]);
    timing.reread = REREAD_LIMIT;
    const { view, reads } = await twoSaves(older, newer);
    expect(held.filter((t) => !t.cleared), "each read is waiting on its own time limit").toHaveLength(2);
    reads.drafts[1].release();
    await settleAll(view);
    expect(newer.shows(view), "the newer read has shown its save").toBe(true);
    const [olderLimit, newerLimit] = held;
    expect(newerLimit.cleared, "the newer read answered in time").toBe(true);
    expect(olderLimit.cleared, "the older read is still waiting").toBe(false);
    olderLimit.fire();
    await settleAll(view);
    expect(reads.drafts[0].state, "the older read ran out of time and was given up").toBe("aborted");
    expect(newer.shows(view)).toBe(true);
    expectFinished(view);
    expect(newer.ready(view)).toBe(true);
  });
});

describe("inline saves behind a superseded read", () => {
  // The queue of saves of one entry is not left waiting for a read that was dropped
  it("a save whose read was dropped is finished, and the next save of that entry goes out on the new revision", async () => {
    const { view, reads } = await twoSaves(INLINE, INLINE_STORY);
    reads.drafts[1].release();
    await settleAll(view);
    reads.drafts[0].release();
    await settleAll(view);
    expect(statusText(view), "the saves are finished").not.toMatch(/saving/i);
    expect(INLINE.ready(view), "the entry can be edited again").toBe(true);
    expect(view.server.writes, "each save was sent once").toHaveLength(2);

    await editAndEnter(view, LEGAL, "Limited partnership");
    expect(alertText(view), "the next save is not refused as stale").toBe("");
    expect(view.server.writes, "one more write").toHaveLength(3);
    expect(stored(view, "company_foundation").content.legal_entity_type, "stored on the revision the page showed").toBe("Limited partnership");
    expect(view.text()).toContain("Limited partnership");
  });
});
