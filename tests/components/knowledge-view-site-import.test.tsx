// Acceptance: "Import from website" on the Site Knowledge card:
// the picker and the saves it makes through the entries API, the dialog's accessibility,
// and that the import never sends a non-http(s) URL. The tests drive the real client components through
// the interactive runtime (tests/helpers/knowledge-view-site-all-runtime.tsx), click the controls,
// and inspect (a) the markup the visitor would see and (b) the requests the UI sent to a fake
// company API, validated against the API's own request schemas, parseBusinessEntry and validateProvenance.
//
// Provenance of imported links may use any origin the field registry allows for site_links
//   (user_provided with actor/time/note, or source_backed); the tests require only that the sent
//   provenance validates against the sent content, coverage included.
// Order among the newly added links is not specified; they must come after the stored ones.
// ReviewStatus of a revision is not constrained.
// The UI must not send more than 500 links; it disables or limits the selection and says so
//   in text (any wording naming a limit, a maximum, "only N more" or 500).
// After a successful save the dialog closes and the card lists the new links.
// After a failed save the dialog stays open with its pages; selection need not be kept
//   (the retry test re-checks whatever is unchecked).
import { describe, expect, it, vi } from "vitest";
import { norm } from "../helpers/knowledge-view-dom";
import { descendants, type HNode } from "../helpers/knowledge-view-site-all-runtime";
import { siteCard, siteCardText } from "../helpers/knowledge-view-site-all-dom";
import {
  ENTRIES_PATH,
  REVISIONS_PATH,
  SOURCES_PATH,
  UUID,
  boxFor,
  boxes,
  cancelButton,
  confirm,
  confirmButton,
  importButton,
  isChecked,
  linkCountsSent,
  openPicker,
  openSite,
  pickerDialog,
  selectPages,
  sentWrite,
  validated,
} from "../helpers/knowledge-view-site-all-import";
import {
  FULL_INVENTORY,
  LINKS,
  LISTED,
  NOT_LISTED,
  PAGES,
  SITE_REVISION,
  emptySiteDraft,
  inventory,
  labelOfPage,
  manyLinks,
  noSiteDraft,
  siteDraft,
  type Page,
} from "../helpers/knowledge-view-site-all-fixtures";

// Large lists (499 links) and many full-page renders: allow for a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

const full = () => ({ inventory: FULL_INVENTORY() });
const LIMIT_MSG = /\b500\b|\bonly \d+ more\b|\blimit\b|\bmaximum\b|\bat most\b|too many|no more than/i;
const withoutGenerated = (text: string) => text.replace(/Generated page \d+/g, "");

describe("the picker", () => {
  it("Import from website opens a named dialog; it is closed until asked for", async () => {
    const view = await openSite(full());
    expect(view.dialogs()).toHaveLength(0);
    const dialog = await openPicker(view);
    expect(view.nameOf(dialog), "the dialog has an accessible name").not.toBe("");
    expect(view.server.gets.map((r) => r.path)).toContain(SOURCES_PATH);
  });

  it("lists the captured pages that are not stored links yet, each by title (or URL when it has none) with its URL, and a checkbox named by that label", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    const text = view.text(dialog);
    for (const page of LISTED) {
      expect(boxFor(view, dialog, page), `a checkbox named "${labelOfPage(page)}"`).toBeDefined();
      expect(text, "the page's URL is shown").toContain(page.url);
    }
    expect(PAGES.untitled.title).toBeNull();
    expect(boxFor(view, dialog, PAGES.untitled)!.props.checked ?? false, "nothing is pre-selected").toBe(false);
  });

  it("leaves out pages that were not captured and pages whose URL is already a stored link", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    const text = view.text(dialog);
    for (const page of NOT_LISTED) {
      expect(text, `${page.state} page "${page.title}"`).not.toContain(page.title ?? page.url);
      expect(text).not.toContain(page.url);
      expect(boxFor(view, dialog, page)).toBeUndefined();
    }
  });

  it("Edge case: a company without any site_links entry is offered every captured page", async () => {
    const view = await openSite({ ...full(), draft: noSiteDraft() });
    const dialog = await openPicker(view);
    expect(boxFor(view, dialog, PAGES.careersCopy), "nothing is stored yet, so the careers page is offered").toBeDefined();
    for (const page of LISTED) {
      expect(boxFor(view, dialog, page)).toBeDefined();
    }
  });

  it.each([
    ["no page at all", inventory([])],
    ["only pages that were not captured", inventory([PAGES.failed, PAGES.blocked, PAGES.pending, PAGES.linked])],
    ["only pages that are already stored links", inventory([PAGES.careersCopy])],
  ])("Edge case: %s: the picker says there is nothing to add and cannot add anything", async (_name, source) => {
    const view = await openSite({ inventory: source });
    const dialog = await openPicker(view);
    expect(boxes(view, dialog)).toHaveLength(0);
    expect(view.text(dialog)).toMatch(/\bno\b[^.]*\bpages?\b|nothing (left |new )?to (add|import)|already (been )?(imported|added)/i);
    const button = confirmButton(view, dialog);
    if (button) {
      expect(await view.click(button), "Add selected cannot be used with nothing to add").toBe(false);
    }
    await view.settle();
    expect(view.server.writes).toEqual([]);
  });

  it("Add selected with nothing checked sends nothing", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    const button = confirmButton(view, dialog);
    expect(button, 'an "Add selected" button').toBeDefined();
    await view.click(button!);
    await view.settle();
    expect(view.server.writes).toEqual([]);
  });

  it("Cancel closes the dialog and sends nothing, even with pages checked", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    await selectPages(view, [PAGES.shop, PAGES.subscribe]);
    const cancel = cancelButton(view, pickerDialog(view)!);
    expect(cancel, 'a "Cancel" button').toBeDefined();
    await view.click(cancel!);
    await view.settle();
    expect(view.dialogs()).toHaveLength(0);
    expect(view.server.writes).toEqual([]);
    void dialog;
  });

  it("Edge case: the crawl inventory cannot be read: the error is shown and nothing can be saved", async () => {
    const view = await openSite({ ...full(), configure: (s) => { s.sourcesFailure = { status: 500, message: "The crawl inventory is unavailable." }; } });
    await view.click(importButton(view));
    await view.settle();
    expect(view.text()).toContain("The crawl inventory is unavailable.");
    const dialog = pickerDialog(view);
    if (dialog) {
      expect(boxes(view, dialog)).toHaveLength(0);
    }
    expect(view.server.writes).toEqual([]);
  });

  it("Edge case: a second click on Import from website does not open a second dialog", async () => {
    const view = await openSite(full());
    await openPicker(view);
    const again = view.byRole("button", /^import from website$/i)[0];
    if (again) {
      await view.click(again);
    }
    await view.settle();
    expect(view.dialogs().length).toBeLessThanOrEqual(1);
  });
});

describe("saving into an existing site_links entry (POST /entries/<id>/revisions)", () => {
  it("sends one revision with expectedRevision = the current revision, the stored links first, and a new link per checked page", async () => {
    const view = await openSite(full());
    await openPicker(view);
    await selectPages(view, [PAGES.shop, PAGES.untitled]);
    await confirm(view);
    expect(view.server.writesTo("entries"), "no new entry is created").toHaveLength(0);
    const sent = sentWrite(view.server, "revise");
    expect(sent.req.path).toBe(REVISIONS_PATH);
    expect(sent.body.expectedRevision).toBe(SITE_REVISION);
    expect(sent.body.requestId).toMatch(UUID);
    const links = sent.content.links;
    expect(links.slice(0, LINKS.length), "stored links are kept, in order, unchanged").toEqual(LINKS);
    const added = links.slice(LINKS.length);
    expect(added).toHaveLength(2);
    const byUrl = Object.fromEntries(added.map((l) => [l.url, l]));
    expect(byUrl[PAGES.shop.url].title).toBe("Shop our coffees");
    expect(byUrl[PAGES.untitled.url].title, "a page without a title is titled by its URL").toBe(PAGES.untitled.url);
    for (const link of added) {
      expect(link.note).toBeNull();
      expect(link.id).toMatch(UUID);
      expect(LINKS.map((l) => l.id)).not.toContain(link.id);
    }
    expect(new Set(links.map((l) => l.id)).size, "unique ids").toBe(links.length);
  });

  it("an entry that exists with no links is revised too (never created again)", async () => {
    const view = await openSite({ ...full(), draft: emptySiteDraft() });
    await openPicker(view);
    await selectPages(view, [PAGES.workshops]);
    await confirm(view);
    expect(view.server.writesTo("entries")).toHaveLength(0);
    const sent = sentWrite(view.server, "revise");
    expect(sent.body.expectedRevision).toBe(SITE_REVISION);
    expect(sent.content.links.map((l) => l.url)).toEqual([PAGES.workshops.url]);
  });

  it("after success the dialog is closed and the card lists the stored links followed by the new ones", async () => {
    const view = await openSite(full());
    await openPicker(view);
    await selectPages(view, [PAGES.shop, PAGES.workshops]);
    await confirm(view);
    expect(view.dialogs()).toHaveLength(0);
    const page = view.page();
    const card = siteCard(page)!;
    expect(card).not.toBeNull();
    const text = siteCardText(page, card);
    const positions = [...LINKS.map((l) => l.title), "Shop our coffees", "Roasting workshops"].map((t) => text.indexOf(t));
    positions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    expect(positions.slice(0, 4)).toEqual([...positions.slice(0, 4)].sort((a, b) => a - b));
    expect(Math.min(positions[4], positions[5])).toBeGreaterThan(positions[3]);
    expect(view.byRole("button", /^import from website$/i)).toHaveLength(1);
  });

  it("importing twice: the second picker no longer offers the first import's pages, and ids stay unique", async () => {
    const view = await openSite(full());
    await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await confirm(view);
    const second = await openPicker(view);
    expect(boxFor(view, second, PAGES.shop), "an imported page is not offered again").toBeUndefined();
    await selectPages(view, [PAGES.subscribe]);
    await confirm(view);
    const writes = view.server.writesTo("revisions");
    expect(writes).toHaveLength(2);
    const first = validated(writes[0], "revise");
    const next = validated(writes[1], "revise");
    expect(next.body.expectedRevision, "the second save is based on the first save's revision").toBe(SITE_REVISION + 1);
    expect(next.content.links.slice(0, LINKS.length + 1)).toEqual(first.content.links);
    expect(new Set(next.content.links.map((l) => l.id)).size).toBe(LINKS.length + 2);
    expect(next.content.links.at(-1)!.url).toBe(PAGES.subscribe.url);
  });

  it("Edge case: a title that is only blank space is replaced so the saved link still validates", async () => {
    const blank: Page = { ...PAGES.shop, title: "   " };
    const view = await openSite({ inventory: inventory([blank]) });
    const dialog = await openPicker(view);
    expect(boxes(view, dialog), "the one captured page is offered").toHaveLength(1);
    await view.check(boxes(view, dialog)[0].node, true);
    await view.settle();
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    expect(sent.content.links.at(-1)!.title.trim()).not.toBe("");
  });
});

describe("creating the site_links entry (POST /entries)", () => {
  it("with no entry yet, creates it with kind site_links and only the new links", async () => {
    const view = await openSite({ ...full(), draft: noSiteDraft() });
    await openPicker(view);
    await selectPages(view, [PAGES.shop, PAGES.subscribe]);
    await confirm(view);
    const sent = sentWrite(view.server, "create");
    expect(sent.req.path).toBe(ENTRIES_PATH);
    expect(sent.body.kind).toBe("site_links");
    expect(sent.body.requestId).toMatch(UUID);
    expect(sent.content.links.map((l) => [l.title, l.url, l.note])).toEqual(
      expect.arrayContaining([
        ["Shop our coffees", PAGES.shop.url, null],
        ["Subscribe and save", PAGES.subscribe.url, null],
      ]),
    );
    expect(sent.content.links).toHaveLength(2);
    for (const link of sent.content.links) {
      expect(link.id).toMatch(UUID);
    }
  });

  it("after success the card shows the new links instead of the empty state", async () => {
    const view = await openSite({ ...full(), draft: noSiteDraft() });
    await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await confirm(view);
    expect(view.dialogs()).toHaveLength(0);
    const page = view.page();
    const text = siteCardText(page, siteCard(page)!);
    expect(text).toContain("Shop our coffees");
    expect(text).not.toMatch(/no (internal )?(links|pages)/i);
  });
});

describe("selection, repeats and failures", () => {
  it("Edge case: checking a page twice (on, off, on) adds it once; unchecking removes it", async () => {
    const view = await openSite(full());
    await openPicker(view);
    const toggle = async (page: Page, checked: boolean) => {
      await view.check(boxFor(view, pickerDialog(view)!, page)!, checked);
      await view.settle();
    };
    await toggle(PAGES.shop, true);
    await toggle(PAGES.shop, false);
    await toggle(PAGES.shop, true);
    await toggle(PAGES.subscribe, true);
    await toggle(PAGES.subscribe, false);
    await toggle(PAGES.workshops, true);
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    expect(sent.content.links.slice(LINKS.length).map((l) => l.url).sort()).toEqual([PAGES.shop.url, PAGES.workshops.url].sort());
  });

  it("Edge case: the same URL captured twice is saved once", async () => {
    const twin: Page = { ...PAGES.shop, sourceId: PAGES.subscribe.sourceId, title: "Shop (second capture)" };
    const view = await openSite({ inventory: inventory([PAGES.shop, twin, PAGES.workshops]) });
    const dialog = await openPicker(view);
    for (const box of boxes(view, dialog)) {
      await view.check(box.node, true);
    }
    await view.settle();
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    const urls = sent.content.links.map((l) => l.url);
    expect(new Set(urls).size, "a URL is listed once").toBe(urls.length);
    expect(urls).toEqual(expect.arrayContaining([PAGES.shop.url, PAGES.workshops.url]));
  });

  it("Edge case: a double click on Add selected sends one request", async () => {
    const view = await openSite({ ...full(), configure: (s) => s.hold() });
    const dialog = await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    const first = confirmButton(view, pickerDialog(view) ?? dialog)!;
    await view.click(first);
    const again = pickerDialog(view) ? confirmButton(view, pickerDialog(view)!) : undefined;
    if (again) {
      await view.click(again);
    }
    await view.settle();
    view.server.release();
    await view.settle();
    expect(view.server.writes, "one save, not two").toHaveLength(1);
    validated(view.server.writes[0], "revise");
  });

  it("Edge case: a double click when the entry does not exist yet creates it once", async () => {
    const view = await openSite({ ...full(), draft: noSiteDraft(), configure: (s) => s.hold() });
    const dialog = await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await view.click(confirmButton(view, pickerDialog(view) ?? dialog)!);
    const again = pickerDialog(view) ? confirmButton(view, pickerDialog(view)!) : undefined;
    if (again) {
      await view.click(again);
    }
    view.server.release();
    await view.settle();
    expect(view.server.writesTo("entries")).toHaveLength(1);
  });

  it("Edge case: a 409 (the entry changed elsewhere) shows an error that says to reload, keeps the dialog and its pages, and does not retry", async () => {
    const view = await openSite({ ...full(), configure: (s) => { s.writeFailure = { status: 409, message: "Conflict." }; } });
    const asked = (text: string) => (text.match(/reload|refresh/gi) ?? []).length;
    const before = asked(view.text());
    await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await confirm(view);
    expect(view.server.writes, "one attempt, no automatic retry").toHaveLength(1);
    expect(asked(view.text()), "the error tells the person to reload").toBeGreaterThan(before);
    const dialog = pickerDialog(view);
    expect(dialog, "the dialog stays open").toBeDefined();
    for (const page of LISTED) {
      expect(boxFor(view, dialog!, page), `"${labelOfPage(page)}" is still listed`).toBeDefined();
    }
  });

  it("Edge case: a failed save shows the server's message, keeps the dialog, and a retry can succeed", async () => {
    const view = await openSite({ ...full(), configure: (s) => { s.writeFailure = { status: 500, message: "Sitemap storage is offline." }; } });
    await openPicker(view);
    await selectPages(view, [PAGES.shop, PAGES.workshops]);
    await confirm(view);
    expect(view.text()).toContain("Sitemap storage is offline.");
    expect(view.server.writes).toHaveLength(1);
    let dialog = pickerDialog(view);
    expect(dialog, "the dialog stays open").toBeDefined();
    for (const page of LISTED) {
      expect(boxFor(view, dialog!, page)).toBeDefined();
    }
    // the server recovers; whatever the dialog lost, the person checks again and retries
    view.server.writeFailure = null;
    for (const page of [PAGES.shop, PAGES.workshops]) {
      const box = boxFor(view, pickerDialog(view)!, page)!;
      if (!isChecked(box)) {
        await view.check(box, true);
      }
    }
    await view.settle();
    await confirm(view);
    dialog = pickerDialog(view);
    expect(dialog, "the dialog closes after the retry succeeds").toBeUndefined();
    const retried = validated(view.server.writes.at(-1)!, "revise");
    expect(retried.content.links.slice(LINKS.length).map((l) => l.url).sort()).toEqual([PAGES.shop.url, PAGES.workshops.url].sort());
  });

  it("Edge case: the 409 from a really stale revision (the entry moved on) is handled the same way", async () => {
    const view = await openSite({
      ...full(),
      configure: (s) => {
        const entry = s.draft.entries.find((e: { kind: string }) => e.kind === "site_links");
        // the person's page still shows revision 4; the server is already at 5
        s.fetch = ((original) => async (input: unknown, init?: { method?: string; body?: unknown }) => {
          if ((init?.method ?? "GET") === "POST" && String(input).endsWith("/revisions")) {
            entry.current_revision = entry.revision = 5;
          }
          return original(input, init);
        })(s.fetch);
      },
    });
    await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await confirm(view);
    expect(view.server.writes).toHaveLength(1);
    expect(view.text()).toMatch(/reload|refresh/i);
    expect(pickerDialog(view)).toBeDefined();
  });
});

describe("the 500-link limit", () => {
  const nearlyFull = () => ({
    inventory: inventory([PAGES.shop, PAGES.subscribe, PAGES.workshops]),
    draft: siteDraft({ links: manyLinks(499) }),
  });

  it("Edge case: with 499 links, one more page is saved (500 links), and a second is not sent", async () => {
    const view = await openSite(nearlyFull());
    await openPicker(view);
    // try to add two: a browser fires nothing for a disabled box or button
    for (const page of [PAGES.shop, PAGES.subscribe]) {
      const box = boxFor(view, pickerDialog(view)!, page);
      expect(box).toBeDefined();
      await view.check(box!, true);
      await view.settle();
    }
    const dialog = pickerDialog(view)!;
    expect(view.text(dialog), "the dialog says why a second page cannot be added").toMatch(LIMIT_MSG);
    const button = confirmButton(view, dialog);
    if (button) {
      await view.click(button);
    }
    await view.settle();
    for (const count of linkCountsSent(view.server)) {
      expect(count).toBeLessThanOrEqual(500);
    }
    for (const write of view.server.writes) {
      validated(write, "revise");
    }
  });

  it("Edge case: with 499 links, exactly one page can still be imported, giving 500 links", async () => {
    const view = await openSite(nearlyFull());
    await openPicker(view);
    await selectPages(view, [PAGES.workshops]);
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    expect(sent.content.links).toHaveLength(500);
    expect(sent.content.links.at(-1)!.url).toBe(PAGES.workshops.url);
  });

  it("Edge case: with 500 links nothing can be imported, and the person is told why", async () => {
    const view = await openSite({ inventory: inventory([PAGES.shop, PAGES.subscribe]), draft: siteDraft({ links: manyLinks(500) }) });
    const button = importButton(view);
    await view.click(button);
    await view.settle();
    const dialog = pickerDialog(view);
    if (dialog) {
      for (const box of boxes(view, dialog)) {
        await view.check(box.node, true);
      }
      await view.settle();
      const confirmed = confirmButton(view, pickerDialog(view) ?? dialog);
      if (confirmed) {
        await view.click(confirmed);
      }
      await view.settle();
    }
    expect(view.server.writes, "no write that would exceed 500").toEqual([]);
    expect(withoutGenerated(view.text()), "the limit is explained").toMatch(LIMIT_MSG);
  });
});

describe("the import never sends a non-http(s) URL", () => {
  const hostilePages = (): Page[] => [
    { ...PAGES.shop, url: "javascript:alert(document.cookie)", title: "Javascript page" },
    { ...PAGES.shop, url: "data:text/html;base64,PHNjcmlwdD4=", title: "Data page" },
    { ...PAGES.shop, url: "ftp://files.harborandpine.example/menu.pdf", title: "File transfer page" },
    { ...PAGES.shop, url: "//evil.example/steal", title: "Protocol relative page" },
    { ...PAGES.shop, url: "/relative/path", title: "Relative page" },
    { ...PAGES.shop, url: "https://user:secret@www.harborandpine.example/private", title: "Credentials page" },
    { ...PAGES.subscribe, title: '<img src=x onerror="alert(1)">Subscribe & <b>save</b>' },
    PAGES.workshops,
  ];

  it("a captured page whose URL is not plain http(s) is not listed, and everything that is listed is saved as http(s)", async () => {
    const view = await openSite({ inventory: inventory(hostilePages()) });
    const dialog = await openPicker(view);
    const text = view.text(dialog);
    for (const bad of ["Javascript page", "Data page", "File transfer page", "Protocol relative page", "Relative page", "Credentials page"]) {
      expect(text, bad).not.toContain(bad);
    }
    expect(text).not.toMatch(/javascript:|data:text|ftp:|evil\.example|secret@/);
    expect(boxes(view, dialog).length).toBeGreaterThanOrEqual(2);
    for (const box of boxes(view, dialog)) {
      await view.check(box.node, true);
    }
    await view.settle();
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    const added = sent.content.links.slice(LINKS.length);
    expect(added.length).toBeGreaterThanOrEqual(2);
    for (const link of added) {
      expect(link.url).toMatch(/^https?:\/\/[^@]+$/i);
    }
  });

  it("a page title with markup is shown as text and saved verbatim", async () => {
    const view = await openSite({ inventory: inventory(hostilePages()) });
    const dialog = await openPicker(view);
    const html = view.html();
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>save</b>");
    expect(view.text(dialog)).toContain('<img src=x onerror="alert(1)">Subscribe & <b>save</b>');
    await selectPages(view, [{ ...PAGES.subscribe, title: '<img src=x onerror="alert(1)">Subscribe & <b>save</b>' }]);
    await confirm(view);
    const sent = sentWrite(view.server, "revise");
    expect(sent.content.links.at(-1)!.title).toBe('<img src=x onerror="alert(1)">Subscribe & <b>save</b>');
  });
});

describe("the dialog is keyboard operable", () => {
  it("is a modal dialog: a native <dialog> or role=dialog with aria-modal", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    const native = dialog.tag === "dialog" && !dialog.props.role;
    expect(native || dialog.props["aria-modal"] === true || dialog.props["aria-modal"] === "true", "aria-modal").toBe(true);
    expect(view.nameOf(dialog)).not.toBe("");
  });

  it("moves focus into the dialog when it opens", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    expect(view.focusMovedInto(dialog), "autoFocus, a focus() call inside the dialog, or showModal() on a native dialog").toBe(true);
  });

  it("Escape closes the dialog without saving", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    await selectPages(view, [PAGES.shop]);
    await view.press(pickerDialog(view) ?? dialog, "Escape");
    await view.settle();
    expect(view.dialogs()).toHaveLength(0);
    expect(view.server.writes).toEqual([]);
  });

  it("Cancel and Add selected are buttons in the dialog, and nothing clickable in it is out of reach of the keyboard", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    expect(cancelButton(view, dialog), "Cancel").toBeDefined();
    expect(confirmButton(view, dialog), "Add selected").toBeDefined();
    const NATIVE = ["button", "input", "a", "select", "textarea", "summary"];
    const interactive = (n: HNode) => NATIVE.includes(n.tag);
    const clickable = descendants(dialog).filter((n) => typeof n.props.onClick === "function");
    for (const node of clickable) {
      const native = interactive(node) || node.tag === "label";
      const operable = ["button", "checkbox", "link", "menuitem", "option"].includes(String(node.props.role)) && Number(node.props.tabIndex) >= 0;
      // a plain wrapper that only guards clicks (stopPropagation) around real controls is fine
      const wrapsControls = descendants(node).some(interactive);
      expect(native || operable || wrapsControls, `<${node.tag}> with a click handler must be keyboard operable`).toBe(true);
    }
  });

  it("every checkbox is named by its page's title (or URL) and the names are distinct", async () => {
    const view = await openSite(full());
    const dialog = await openPicker(view);
    const names = boxes(view, dialog).map((b) => b.name);
    expect(names.length).toBeGreaterThanOrEqual(LISTED.length);
    expect(new Set(names).size).toBe(names.length);
    for (const page of LISTED) {
      expect(names.some((n) => n.toLowerCase().includes(labelOfPage(page).toLowerCase()))).toBe(true);
    }
    for (const name of names) {
      expect(norm(name)).not.toMatch(/^(select|check)?\s*$/i);
    }
  });
});
