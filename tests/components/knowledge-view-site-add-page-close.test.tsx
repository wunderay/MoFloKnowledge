// Also: a title over the link title limit is refused, not truncated.
// The browser can close a modal <dialog> without a cancel event (Escape pressed twice), and fires a
// "close" event. The add-page dialog must stay recoverable: while a save runs it is shown again, so a
// failure is visible; otherwise it closes normally. After a failed save the address field has focus.
import { describe, expect, it, vi } from "vitest";
import { focusedPath } from "../helpers/knowledge-view-site-all-runtime";
import { openSite, sentWrite } from "../helpers/knowledge-view-site-all-import";
import { SITE, siteDraft } from "../helpers/knowledge-view-site-all-fixtures";
import { addButton, alertText, fill, openAdd, openDialogs, save, theDialog, titleField, urlField, valueOf } from "../helpers/knowledge-view-add-page";

vi.setConfig({ testTimeout: 30_000 });

const NEW_URL = `${SITE}/pages/new-arrivals`;

/** The browser closes the open modal on its own and reports a "close" event (no "cancel" before it). */
async function browserCloses(view: Awaited<ReturnType<typeof openSite>>, dialog: Parameters<typeof view.fresh>[0]) {
  const node = view.fakeOf(dialog) && view.app.fakes.get(dialog.path)!.node;
  node.open = false;
  view.fresh(dialog)!.props.onClose({ type: "close", currentTarget: node, target: node });
  view.app.flushSync();
  await view.settle();
}

describe("a dialog the browser closes by itself", () => {
  it("during a save it is shown again, and a failed save is visible with the input intact and focus on the address", async () => {
    const view = await openSite({
      draft: siteDraft(),
      configure: (s) => {
        s.writeFailure = { status: 503, message: "Sitemap storage is offline." };
        s.hold();
      },
    });
    const dialog = await openAdd(view);
    await fill(view, NEW_URL, "New arrivals");
    await view.click(view.byRole("button", /^save/i, dialog)[0]);
    const shown = view.fakeOf(dialog)!.showModalCalls;
    await browserCloses(view, dialog);
    expect(view.fakeOf(dialog)!.showModalCalls, "the dialog is shown again").toBe(shown + 1);
    expect(openDialogs(view), "still mounted and open").toHaveLength(1);

    view.server.release();
    await view.settle();
    const again = theDialog(view)!;
    expect(again, "open after the failure").toBeDefined();
    expect(alertText(view, again)).toMatch(/offline/i);
    expect(valueOf(view, urlField(view, again))).toBe(NEW_URL);
    expect(focusedPath(), "focus is on the address").toBe(urlField(view, again)!.path);
  });

  it("when nothing is saving it closes normally and \"+ Add page\" opens it again", async () => {
    const view = await openSite({ draft: siteDraft() });
    const dialog = await openAdd(view);
    await browserCloses(view, dialog);
    expect(openDialogs(view)).toHaveLength(0);
    expect(view.dialogs()).toHaveLength(0);
    expect(view.server.writes).toEqual([]);
    await openAdd(view);
    expect(addButton(view)).toBeDefined();
  });
});

describe("the title length limit", () => {
  it("a title of exactly 20,000 characters is saved whole", async () => {
    const view = await openSite({ draft: siteDraft() });
    await openAdd(view);
    const title = "t".repeat(20_000);
    await fill(view, NEW_URL, title);
    await save(view);
    expect(openDialogs(view)).toHaveLength(0);
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.title).toBe(title);
  });
  it("a title of 20,001 characters is refused with a message, the input intact and nothing sent", async () => {
    const view = await openSite({ draft: siteDraft() });
    await openAdd(view);
    const title = "t".repeat(20_001);
    await fill(view, NEW_URL, title);
    await save(view);
    const dialog = theDialog(view)!;
    expect(dialog, "the dialog stays open").toBeDefined();
    expect(alertText(view, dialog)).toMatch(/title.*20,000 characters or fewer/i);
    expect(valueOf(view, titleField(view, dialog))).toBe(title);
    expect(valueOf(view, urlField(view, dialog))).toBe(NEW_URL);
    expect(view.server.writes, "nothing was sent").toEqual([]);
  });
  it("20,000 characters of spaces around a short title do not count", async () => {
    const view = await openSite({ draft: siteDraft() });
    await openAdd(view);
    await fill(view, NEW_URL, `${" ".repeat(15_000)}Short${" ".repeat(15_000)}`);
    await save(view);
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.title).toBe("Short");
  });
});
