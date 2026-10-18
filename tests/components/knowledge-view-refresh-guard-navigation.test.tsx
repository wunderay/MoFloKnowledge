// Acceptance, Quest Q19 refresh-draft-guard, criteria C1, C3 and C4 (owner findings on PRs #13, #19, #20, #21).
//
// KnowledgeViewer re-reads the draft after every save made in the view. That read is applied to the page
// only if the view is still showing the draft it was started for. A read that finishes after the person
// switched to a saved version (or another company) must change nothing: not the content, the entries, the
// selector or the notices. Switching back to the draft shows the latest draft (it is read again).
//
// DECISION (what "changes nothing" means): the text of the page, the value of the version selector and the
//   notices are compared before and after the late answer; they must be identical, and the saved version's
//   own content must not contain what the late draft answer carried.
// DECISION (late failures): a draft read that fails, or runs out of time, after the view moved on is ignored
//   too: it leaves no "Saved. Reload" notice and no blocked controls on the view that is shown afterwards.
// DECISION (the caller): the save is committed, so an ignored read is not a failure of the save: no error
//   is shown for it and nothing is sent again.
// The same four ways of saving are tried each time (inline edit, "+ Add page", import, a people action).
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { timing } from "../../src/components/knowledge-view/timing";
import {
  DRIVERS,
  FAILURE_TEXT,
  INLINE,
  OTHER_COMPANY_ID,
  SNAPSHOT_ID,
  STALE_NOTICE,
  openGuarded,
  selectVersion,
  selected,
  sleep,
  universalDraft,
  type Driver,
} from "../helpers/knowledge-view-refresh-guard";
import { buildDraft } from "../helpers/knowledge-view-fixtures";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => {
  timing.reread = 8000;
  timing.fresh = 12000;
});

const READ_ONLY = /read only/i;
const ids = (view: { server: { writes: unknown[] } }) => view.server.writes.length;

describe.each(DRIVERS)("$name: a draft refresh that resolves after switching to a saved version", (driver: Driver) => {
  // C1, C3
  it("changes nothing that is shown: content, selector and notices stay the saved version's", async () => {
    const { view, reads } = await openGuarded(driver.sectionId);
    expect(driver.shows(view), "the saved change is not shown yet").toBe(false);
    reads.holdNext();
    await driver.act(view);
    expect(reads.drafts, "the save's draft read is on its way").toHaveLength(1);
    expect(reads.drafts[0].state).toBe("pending");
    const writes = ids(view);

    await selectVersion(view, SNAPSHOT_ID);
    expect(selected(view)).toBe(SNAPSHOT_ID);
    expect(view.text(), "the saved version is shown (read only)").toMatch(READ_ONLY);
    const before = view.text();

    reads.drafts[0].release();
    await view.settle();
    await sleep(30);
    await view.settle();

    expect(selected(view), "the selector still names the saved version").toBe(SNAPSHOT_ID);
    expect(view.text(), "the late draft answer changed nothing on the page").toBe(before);
    expect(driver.shows(view), "what the draft read carried is not shown under the saved version").toBe(false);
    expect(view.text()).not.toMatch(STALE_NOTICE);
    expect(view.text()).not.toMatch(FAILURE_TEXT);
    expect(ids(view), "the save is not sent again").toBe(writes);
  });

  // C1, C3
  it("switching back to the draft reads it again and shows the latest draft", async () => {
    const { view, reads } = await openGuarded(driver.sectionId);
    reads.holdNext();
    await driver.act(view);
    await selectVersion(view, SNAPSHOT_ID);
    reads.drafts[0].release();
    await view.settle();
    await sleep(30);
    const draftReads = reads.draftGets();

    await selectVersion(view, "draft");
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(selected(view)).toBe("draft");
    expect(reads.draftGets(), "the draft is read again").toBeGreaterThan(draftReads);
    expect(driver.shows(view), "the latest draft, with the saved change").toBe(true);
    expect(view.text()).not.toMatch(STALE_NOTICE);
    expect(driver.ready(view), "editing is available again").toBe(true);
  });

  // C1: the saved version is still loading when the late draft answer arrives
  it("does not put the draft's content on the page while the saved version is still loading", async () => {
    const { view, reads } = await openGuarded(driver.sectionId);
    reads.holdNext();
    await driver.act(view);
    reads.holdVersionNext();
    await selectVersion(view, SNAPSHOT_ID);
    expect(reads.versions, "the saved version is being read").toHaveLength(1);
    const loading = view.text();

    reads.drafts[0].release();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(driver.shows(view), "the draft's change is not shown while the saved version loads").toBe(false);
    expect(view.text(), "the loading page is untouched").toBe(loading);
    expect(view.text()).not.toMatch(STALE_NOTICE);

    reads.versions[0].release();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(selected(view)).toBe(SNAPSHOT_ID);
    expect(view.text()).toMatch(READ_ONLY);
    expect(driver.shows(view), "the saved version shows the saved version").toBe(false);
  });

  // C1, C4: a late failure and a late time-out are ignored too
  it.each([
    ["fails", async (reads: Awaited<ReturnType<typeof openGuarded>>["reads"]) => reads.drafts[0].fail()],
    [
      "runs out of time",
      async () => {
        await sleep(400);
      },
    ],
  ] as const)("a read that %s after the view moved on leaves no stale notice and nothing blocked", async (_name, finish) => {
    timing.reread = 150;
    const { view, reads } = await openGuarded(driver.sectionId);
    reads.holdNext();
    await driver.act(view);
    await selectVersion(view, SNAPSHOT_ID);
    await selectVersion(view, "draft");
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(driver.shows(view), "the draft was read again on the way back").toBe(true);

    await finish(reads);
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(view.text(), "no 'Saved. Reload' notice on the view that is shown now").not.toMatch(STALE_NOTICE);
    expect(view.text()).not.toMatch(FAILURE_TEXT);
    expect(driver.shows(view), "the content stays").toBe(true);
    expect(driver.ready(view), "nothing is blocked").toBe(true);
  });
});

describe("a draft refresh that resolves after the company changed", () => {
  // C1
  it("changes nothing of the other company's view", async () => {
    const other = buildDraft();
    other.company = { ...other.company, id: OTHER_COMPANY_ID, name: "Quay Street Tea" };
    for (const entry of other.entries) {
      entry.company_id = OTHER_COMPANY_ID;
    }
    (other.entries.find((e) => e.kind === "company_foundation")!.content as { legal_entity_type: string }).legal_entity_type = "Quay Street Co-operative";
    const { view, reads } = await openGuarded(INLINE.sectionId, { draft: universalDraft(), other });
    reads.holdNext();
    await INLINE.act(view);

    // The same viewer is given another company.
    const root = view.app.root as React.ReactElement<{ companyId: string }>;
    view.app.root = React.cloneElement(root, { companyId: OTHER_COMPANY_ID });
    view.app.markDirty();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(view.text(), "the other company's draft is shown").toContain("Quay Street Co-operative");
    const before = view.text();

    reads.drafts[0].release();
    await view.settle();
    await sleep(30);
    await view.settle();
    expect(view.text(), "the first company's late answer changed nothing").toBe(before);
    expect(INLINE.shows(view)).toBe(false);
    expect(view.text()).not.toMatch(STALE_NOTICE);
  });
});
