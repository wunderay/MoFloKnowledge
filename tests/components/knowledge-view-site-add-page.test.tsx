// Acceptance: the Site Knowledge "+ Add page" dialog (Quest Q11). On an editable draft "+ Add page" is a
// button that opens an in-page modal dialog with "Page URL" (required) and "Title" (optional); Save writes
// through the importer's entries/revisions API. The tests drive the real client components through the
// interactive runtime and check the markup and the requests sent to the fake company API, validated against
// the API's own request schemas and the server's provenance functions.
//
// DECISION (editable only): "+ Add page" is a button only where the view is an editable draft
//   (owner role); in a saved snapshot and for a viewer it stays the existing link to the editor.
// DECISION (company website): the company's website is the Company Foundation field `website`
//   (company_foundation.website); the company row's creation URL does not count.
// DECISION (no website): the dialog still opens but says "Add the company website first" and nothing is sent.
// DECISION (validation): checked when Save is pressed (or Enter), in this order: empty address, scheme,
//   address contract (e.g. credentials), same site, duplicate. A failed check shows ONE human message in a
//   role="alert" inside the dialog; the dialog stays open, input is intact, nothing is sent.
// DECISION (messages): empty "Enter the page URL."; no/other scheme must mention https:// ; other site
//   "Use a page on <company host without www.>"; duplicate names the existing link's title and says
//   it is already in the list.
// DECISION (stored values): the stored url is new URL(trimmed input).href; the stored title is the
//   trimmed title, or the stored url when the title is empty/blank; note is null.
// DECISION (same site): host equals the company website host or is a subdomain of it, ignoring case and a
//   leading "www." on either side.
// DECISION (duplicate): same address ignoring hash and trailing slash (query still distinguishes pages).
// DECISION (failed refresh): after a committed save whose draft re-read fails the dialog closes, the page
//   says "Saved. Reload to see the latest links.", and "+ Add page" is disabled until Reload succeeds.
import { describe, expect, it, vi } from "vitest";
import { CreateEntrySchema, SaveEntrySchema } from "../../src/contracts/api-entries";
import { EntryProvenanceSchema, entryBusiness, parseBusinessEntry, validateProvenance } from "../../src/contracts";
import { FakeServer } from "../helpers/knowledge-view-site-all-runtime";
import { openSite, sentWrite, UUID } from "../helpers/knowledge-view-site-all-import";
import { siteCard, siteCardText, addPageLinks, importControls } from "../helpers/knowledge-view-site-all-dom";
import { openView, descendants } from "../helpers/knowledge-view-site-all-runtime";
import {
  ACTOR,
  COMPANY_ID,
  FULL_INVENTORY,
  LINKS,
  SITE,
  SITE_ENTRY_ID,
  SITE_REVISION,
  emptySiteDraft,
  manyLinks,
  noSiteDraft,
  siteAddHref,
  siteDraft,
  siteSnapshot,
  userProvenance,
  viewerDraft,
  type Link,
} from "../helpers/knowledge-view-site-all-fixtures";
import {
  ADD_PAGE,
  RAW,
  addButton,
  addButtons,
  addPage,
  alertText,
  cancelButton,
  cardText,
  fill,
  focusReturned,
  openAdd,
  openDialogs,
  pressEnterInUrl,
  probeFocus,
  save,
  saveButton,
  theDialog,
  titleField,
  typeInto,
  urlField,
  valueOf,
  withWebsite,
} from "../helpers/knowledge-view-add-page";

vi.setConfig({ testTimeout: 30_000 });

const { prepareManualCreation, prepareRevision } = await import("../../src/server/revisions");

const NEW_URL = `${SITE}/pages/new-arrivals`;
const WRITE_OFFLINE = { status: 503, message: "Sitemap storage is offline." };
const open = (draft = siteDraft(), configure?: (s: FakeServer) => void) => openSite({ draft, configure });
const noWrites = (view: { server: FakeServer }) => expect(view.server.writes, "nothing was sent").toEqual([]);

/** Open the dialog, try to save `url`, and check it was refused with a human message and nothing was sent. */
async function refused(draft: ReturnType<typeof siteDraft>, url: string, message: RegExp, title?: string) {
  const view = await open(draft);
  await openAdd(view);
  await fill(view, url, title);
  await save(view);
  const dialog = theDialog(view);
  expect(dialog, "the dialog stays open").toBeDefined();
  const text = alertText(view, dialog!);
  expect(text, `a message (role=alert) for ${url}`).toMatch(message);
  expect(text, "a human message, not a code").not.toMatch(RAW);
  expect(valueOf(view, urlField(view, dialog!)), "the address stays as typed").toBe(url);
  if (title !== undefined) expect(valueOf(view, titleField(view, dialog!)), "the title stays as typed").toBe(title);
  noWrites(view);
  return view;
}

/** After the first successful write, GET /draft answers 503 until `recover()` is called. */
function failDraftReadsAfterWrite(server: FakeServer) {
  let written = false;
  let broken = true;
  const original = server.fetch;
  server.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = String(input).split("?")[0]!;
    if (method === "GET" && /\/draft$/.test(path) && written && broken) {
      server.requests.push({ method, path, body: undefined });
      const body = { data: null, error: { code: "unavailable", message: "Draft store is down." }, requestId: "00000000-0000-4000-8000-0000000000aa" };
      return { ok: false, status: 503, json: async () => body, text: async () => JSON.stringify(body) };
    }
    const reply = await original(input, init);
    if (method !== "GET" && reply.ok) written = true;
    return reply;
  }) as typeof server.fetch;
  return { recover: () => void (broken = false) };
}
const disabled = (node: { props: Record<string, unknown> }) => node.props.disabled === true || node.props.disabled === "";

// ---------------------------------------------------------------------------------------------------------
describe("C1 opening and closing the dialog", () => {
  it("on an editable draft \"+ Add page\" is a button, not a link to the editor", async () => {
    const view = await open();
    expect(addButton(view)).toBeDefined();
    const page = view.page();
    expect(addPageLinks(page, siteCard(page)!), "no link named + Add page").toEqual([]);
    expect(openDialogs(view), "no dialog before it is clicked").toHaveLength(0);
    // The older tests count every dialog element the runtime sees: a closed dialog must not be in the markup.
    expect(view.dialogs(), "a closed dialog is not rendered").toHaveLength(0);
  });

  it("opens one modal dialog with an accessible name, a required Page URL, an optional Title, Save and Cancel", async () => {
    const view = await open();
    const dialog = await openAdd(view);
    expect(dialog.props.role, 'role="dialog"').toBe("dialog");
    expect([true, "true"], 'aria-modal="true"').toContain(dialog.props["aria-modal"]);
    expect(view.nameOf(dialog), "an accessible name that says what it is").toMatch(/add page/i);
    const url = urlField(view, dialog);
    const title = titleField(view, dialog);
    expect(url, 'a text field named "Page URL"').toBeDefined();
    expect(title, 'a text field named "Title"').toBeDefined();
    const required = (n: typeof url) => n!.props.required === true || n!.props["aria-required"] === true || n!.props["aria-required"] === "true";
    expect(required(url), "Page URL is required").toBe(true);
    expect(required(title), "Title is optional").toBe(false);
    const fields = descendants(dialog).filter((n) => n.tag === "input" || n.tag === "textarea");
    expect(fields[0], "Page URL is the first field").toBe(url);
    expect(saveButton(view, dialog), 'a "Save" button').toBeDefined();
    expect(cancelButton(view, dialog), 'a "Cancel" button').toBeDefined();
    expect(valueOf(view, url)).toBe("");
    noWrites(view);
  });

  it("moves focus into the first field when it opens", async () => {
    const view = await open();
    const dialog = await openAdd(view);
    const url = urlField(view, dialog)!;
    const firstFocusable = descendants(dialog).find((n) => ["input", "textarea", "select", "button", "a"].includes(n.tag) && !view.isDisabled(n));
    const autofocus = !!url.props.autoFocus;
    const focused = (view.fakeOf(url)?.focusCalls ?? 0) > 0;
    const native = dialog.tag === "dialog" && (view.fakeOf(dialog)?.showModalCalls ?? 0) > 0 && firstFocusable === url;
    expect(autofocus || focused || native, "Page URL receives focus").toBe(true);
  });

  it("Escape closes it, sends nothing and returns focus to \"+ Add page\"", async () => {
    const view = await open();
    const dialog = await openAdd(view);
    const probe = probeFocus(view, dialog);
    await fill(view, NEW_URL);
    await view.press(dialog, "Escape");
    await view.settle();
    expect(openDialogs(view), "closed").toHaveLength(0);
    expect(view.dialogs(), "removed from the markup").toHaveLength(0);
    expect(focusReturned(view, probe), "focus is back on + Add page").toBe(true);
    noWrites(view);
  });

  it("Cancel closes it, sends nothing, returns focus to \"+ Add page\", and the next opening is empty", async () => {
    const view = await open();
    const dialog = await openAdd(view);
    const probe = probeFocus(view, dialog);
    await fill(view, NEW_URL, "Typed and abandoned");
    await view.click(cancelButton(view, dialog)!);
    await view.settle();
    expect(openDialogs(view), "closed").toHaveLength(0);
    expect(focusReturned(view, probe), "focus is back on + Add page").toBe(true);
    noWrites(view);
    const again = await openAdd(view);
    expect(valueOf(view, urlField(view, again))).toBe("");
    expect(valueOf(view, titleField(view, again))).toBe("");
    expect(alertText(view, again), "no stale message").toBe("");
  });

  it("Enter in the Page URL field submits", async () => {
    const view = await open();
    await openAdd(view);
    await fill(view, NEW_URL);
    await pressEnterInUrl(view);
    const sent = sentWrite(view.server, "revise");
    expect(sent.content.links.at(-1)!.url).toBe(NEW_URL);
    expect(openDialogs(view)).toHaveLength(0);
  });

  it("works from the All sections view too", async () => {
    const view = await openView({ section: "All sections", draft: siteDraft() });
    await openAdd(view);
    await fill(view, NEW_URL);
    await save(view);
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.url).toBe(NEW_URL);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C2 the address needs a scheme: http or https", () => {
  it("an empty or blank address asks for one", async () => {
    await refused(siteDraft(), "", /enter .*url/i);
    await refused(siteDraft(), "   ", /enter .*url/i);
  });
  it("\"example.com/page\" asks for https://", async () => {
    await refused(siteDraft(), "example.com/page", /https:\/\//i);
    await refused(siteDraft(), "www.harborandpine.example/shop", /https:\/\//i);
  });
  it.each(["ftp://www.harborandpine.example/menu.pdf", "javascript:alert(1)", "mailto:hello@harborandpine.example", "data:text/html,hi", "//www.harborandpine.example/shop"])(
    "%s is refused with a message about http(s)",
    async (url) => {
      await refused(siteDraft(), url, /https?/i);
    },
  );
  it("an address with a login in it is refused politely", async () => {
    await refused(siteDraft(), "https://owner:secret@www.harborandpine.example/private", /\S/);
  });
  it("http:// is allowed, and the scheme may be written in capitals", async () => {
    const plain = await open();
    await addPage(plain, "http://www.harborandpine.example/plain");
    expect(sentWrite(plain.server, "revise").content.links.at(-1)!.url).toBe("http://www.harborandpine.example/plain");
    const caps = await open();
    await addPage(caps, "HTTPS://WWW.HARBORANDPINE.EXAMPLE/Up");
    expect(sentWrite(caps.server, "revise").content.links.at(-1)!.url).toBe("https://www.harborandpine.example/Up");
  });
  it("surrounding spaces are ignored", async () => {
    const view = await open();
    await addPage(view, `  ${NEW_URL}  `);
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.url).toBe(NEW_URL);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C3 the page must be on the company's own site", () => {
  it.each([`https://harborandpine.example/about-us`, `https://shop.harborandpine.example/x`, `https://www.harborandpine.example/y`, `https://WWW.HarborAndPine.example/z`])(
    "%s is accepted for a company whose website is www.harborandpine.example",
    async (url) => {
      const view = await open();
      await addPage(view, url);
      expect(sentWrite(view.server, "revise").content.links.at(-1)!.url).toBe(new URL(url).href);
    },
  );
  it("a company website without www. accepts the www. host and subdomains", async () => {
    for (const url of ["https://www.harborandpine.example/a", "https://harborandpine.example/b", "https://blog.harborandpine.example/c"]) {
      const view = await open(withWebsite("https://harborandpine.example"));
      await addPage(view, url);
      expect(sentWrite(view.server, "revise").content.links.at(-1)!.url, url).toBe(url);
    }
  });
  it("a company website with a path counts by its host", async () => {
    const view = await open(withWebsite("https://www.harborandpine.example/about"));
    await addPage(view, "https://harborandpine.example/shop");
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.url).toBe("https://harborandpine.example/shop");
  });
  it.each([
    "https://example.com/page",
    "https://harborandpine.example.evil.example/x",
    "https://notharborandpine.example/x",
    "https://evil.example/harborandpine.example",
    "https://evil.example/?next=https://www.harborandpine.example/",
  ])("%s is refused with \"Use a page on harborandpine.example\"", async (url) => {
    await refused(siteDraft(), url, /use a page on (www\.)?harborandpine\.example/i);
  });
  it("a look-alike with a login in the address is refused", async () => {
    await refused(siteDraft(), "https://www.harborandpine.example@evil.example/x", /\S/);
  });
  it("the message names the site from the company profile, not a fixed one", async () => {
    await refused(withWebsite("https://shop.example"), `${SITE}/shop`, /use a page on (www\.)?shop\.example/i);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C4 a page that is already listed", () => {
  const existing = LINKS[2]!; // `${SITE}/visit`
  it.each([`${SITE}/visit/`, `${SITE}/visit#map`, `${SITE}/visit/#map`, `${SITE}/visit`])(
    "%s is refused and names the existing link",
    async (url) => {
      await refused(siteDraft(), url, new RegExp(existing.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      const view = await refused(siteDraft(), url, /already/i);
      expect(alertText(view, theDialog(view)!), "names the title, not only the address").toContain(existing.title);
    },
  );
  it("a stored address with a trailing slash matches one without", async () => {
    const links: Link[] = [{ id: "00000000-0000-4000-8000-0000000d0001", title: "Menu", url: `${SITE}/menu/`, note: null }];
    await refused(siteDraft({ links }), `${SITE}/menu`, /menu/i);
  });
  it("a different query or path is a different page", async () => {
    const view = await open();
    await addPage(view, `${SITE}/visit?tour=1`);
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.url).toBe(`${SITE}/visit?tour=1`);
    const other = await open();
    await addPage(other, `${SITE}/visits`);
    expect(sentWrite(other.server, "revise").content.links.at(-1)!.url).toBe(`${SITE}/visits`);
  });
  it("a page added a moment ago cannot be added twice", async () => {
    const view = await open();
    await addPage(view, NEW_URL, "New arrivals");
    expect(view.server.writes).toHaveLength(1);
    await openAdd(view);
    await fill(view, `${NEW_URL}/`);
    await save(view);
    expect(alertText(view, theDialog(view)!)).toContain("New arrivals");
    expect(view.server.writes, "still one write").toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C5 the title", () => {
  it("an empty title saves the address as the title", async () => {
    const view = await open();
    await addPage(view, NEW_URL);
    const link = sentWrite(view.server, "revise").content.links.at(-1)!;
    expect(link.title).toBe(NEW_URL);
    expect(link.url).toBe(NEW_URL);
  });
  it("a blank title counts as empty", async () => {
    const view = await open();
    await addPage(view, NEW_URL, "   ");
    expect(sentWrite(view.server, "revise").content.links.at(-1)!.title).toBe(NEW_URL);
  });
  it("a given title is kept, trimmed", async () => {
    const view = await open();
    await addPage(view, NEW_URL, "  New arrivals  ");
    const link = sentWrite(view.server, "revise").content.links.at(-1)!;
    expect(link.title).toBe("New arrivals");
    expect(link.note).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C6 saving through the entries and revisions API", () => {
  it("a company without a site_links entry: POST /entries creates it with the new link", async () => {
    const view = await open(noSiteDraft());
    await addPage(view, NEW_URL, "New arrivals");
    expect(view.server.writes, "one write").toHaveLength(1);
    const sent = sentWrite(view.server, "create");
    expect(sent.body.kind).toBe("site_links");
    expect(sent.body.requestId).toMatch(UUID);
    expect(sent.content.links).toHaveLength(1);
    expect(sent.content.links[0]).toEqual({ id: expect.stringMatching(UUID), title: "New arrivals", url: NEW_URL, note: null });
    const targets = sent.provenance.claims.flatMap((c) => c.targets);
    const id = sent.content.links[0]!.id;
    expect(targets, "the title and address are named in provenance").toEqual(expect.arrayContaining([`/site_links/links/@${id}/title`, `/site_links/links/@${id}/url`]));
  });

  it("an existing entry: POST /entries/<id>/revisions keeps every stored link and adds the new one last", async () => {
    const view = await open();
    await addPage(view, NEW_URL, "New arrivals");
    expect(view.server.writes, "one write").toHaveLength(1);
    const sent = sentWrite(view.server, "revise");
    expect(view.server.writes[0]!.path).toBe(`/api/companies/${COMPANY_ID}/entries/${SITE_ENTRY_ID}/revisions`);
    expect(sent.body.expectedRevision).toBe(SITE_REVISION);
    expect(sent.body.requestId).toMatch(UUID);
    expect(sent.content.links.slice(0, LINKS.length)).toEqual(LINKS);
    expect(sent.content.links).toHaveLength(LINKS.length + 1);
    expect(sent.content.links.at(-1)).toEqual({ id: expect.stringMatching(UUID), title: "New arrivals", url: NEW_URL, note: null });
    const before = siteDraft().entries.find((e) => e.id === SITE_ENTRY_ID)!.provenance.claims.map((c) => c.id);
    expect(sent.provenance.claims.map((c) => c.id), "earlier claims are kept").toEqual(expect.arrayContaining(before));
  });

  it("an empty list is revised, not recreated", async () => {
    const view = await open(emptySiteDraft());
    await addPage(view, NEW_URL);
    expect(sentWrite(view.server, "revise").content.links).toHaveLength(1);
  });

  it("the request is accepted by the server's own provenance functions (first entry)", async () => {
    const view = await open(noSiteDraft());
    await addPage(view, NEW_URL, "New arrivals");
    const body = CreateEntrySchema.parse(view.server.writes[0]!.body);
    const stored = prepareManualCreation(body.kind, body.content, body.requestId, ACTOR);
    expect(EntryProvenanceSchema.safeParse(stored).success).toBe(true);
    const content = parseBusinessEntry("site_links", body.content);
    expect(validateProvenance(entryBusiness("site_links", content as never), stored)).toEqual([]);
  });

  it("the request is accepted by the server's own provenance functions (revision)", async () => {
    const draft = siteDraft();
    const view = await open(draft);
    await addPage(view, NEW_URL, "New arrivals");
    const body = SaveEntrySchema.parse(view.server.writes[0]!.body);
    const entry = draft.entries.find((e) => e.id === SITE_ENTRY_ID)!;
    const rows: Record<string, unknown> = {
      knowledge_entries: { kind: "site_links", current_revision: entry.current_revision },
      knowledge_entry_versions: { content: entry.content, provenance: entry.provenance },
    };
    const client = {
      from: (table: string) => {
        const query: any = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: rows[table], error: null }) };
        return query;
      },
    };
    const out = await prepareRevision(client as never, COMPANY_ID, SITE_ENTRY_ID, ACTOR, body as never);
    expect(EntryProvenanceSchema.safeParse(out.provenance).success).toBe(true);
    expect(validateProvenance(entryBusiness("site_links", out.content as never), out.provenance as never)).toEqual([]);
  });

  it("afterwards the dialog closes, the draft is re-read and the card lists the new page", async () => {
    const view = await open();
    await addPage(view, NEW_URL, "New arrivals");
    expect(openDialogs(view), "closed").toHaveLength(0);
    const requests = view.server.requests.map((r) => `${r.method} ${r.path.split("/").pop()}`);
    expect(requests.slice(requests.findIndex((r) => r.startsWith("POST")) + 1), "a draft read follows the write").toContain("GET draft");
    const text = cardText(view);
    expect(text).toContain("New arrivals");
    expect(text).toContain(NEW_URL);
    expect(text).toContain(LINKS[0]!.title);
    expect(view.text()).not.toMatch(/saved\. reload/i);
  });

  it("the first page of a company without links shows up after saving", async () => {
    const view = await open(noSiteDraft());
    await addPage(view, NEW_URL, "New arrivals");
    expect(cardText(view)).toContain("New arrivals");
    expect(cardText(view)).not.toMatch(/no (internal )?(links|pages)/i);
  });

  it("a second page added in the same visit is a revision of the new entry", async () => {
    const view = await open(noSiteDraft());
    await addPage(view, NEW_URL, "One");
    await addPage(view, `${SITE}/pages/second`, "Two");
    expect(view.server.writesTo("entries")).toHaveLength(1);
    expect(view.server.writesTo("revisions")).toHaveLength(1);
    expect(sentWrite(view.server, "revise").content.links.map((l) => l.title)).toEqual(["One", "Two"]);
  });

  it("a double click on Save sends one request", async () => {
    const view = await open(siteDraft(), (s) => s.hold());
    await openAdd(view);
    const dialog = await fill(view, NEW_URL);
    const button = saveButton(view, dialog)!;
    await view.click(button);
    await view.click(button);
    await view.settle();
    view.server.release();
    await view.settle();
    expect(view.server.writes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C7 a failed write and a failed refresh", () => {
  it("a failed write shows an inline error, keeps the dialog open with the input, and a retry works", async () => {
    const view = await open(siteDraft(), (s) => (s.writeFailure = WRITE_OFFLINE));
    await openAdd(view);
    await fill(view, NEW_URL, "New arrivals");
    await save(view);
    const dialog = theDialog(view);
    expect(dialog, "still open").toBeDefined();
    expect(alertText(view, dialog!)).toMatch(/offline/i);
    expect(valueOf(view, urlField(view, dialog!))).toBe(NEW_URL);
    expect(valueOf(view, titleField(view, dialog!))).toBe("New arrivals");
    expect(cardText(view), "the card did not change").not.toContain("New arrivals");
    expect(view.text()).not.toMatch(/saved\. reload/i);
    expect(disabled(saveButton(view, dialog!)!), "Save can be pressed again").toBe(false);

    view.server.writeFailure = null;
    await save(view);
    expect(openDialogs(view)).toHaveLength(0);
    expect(cardText(view)).toContain("New arrivals");
    expect(view.server.writes, "the failed attempt and the retry").toHaveLength(2);
  });

  it("a conflict says the list changed and asks for a reload, keeping the input", async () => {
    const view = await open(siteDraft(), (s) => (s.writeFailure = { status: 409, message: "Conflict." }));
    await openAdd(view);
    await fill(view, NEW_URL);
    await save(view);
    const dialog = theDialog(view)!;
    expect(alertText(view, dialog)).toMatch(/changed/i);
    expect(alertText(view, dialog)).toMatch(/reload/i);
    expect(valueOf(view, urlField(view, dialog))).toBe(NEW_URL);
  });

  for (const [name, draft, kind] of [
    ["revision of an existing entry", siteDraft(), "revisions"],
    ["first entry of a company without one", noSiteDraft(), "entries"],
  ] as const) {
    it(`a saved ${name} whose draft re-read fails says so, blocks more adds and never resends`, async () => {
      let control!: { recover: () => void };
      const view = await open(draft, (s) => (control = failDraftReadsAfterWrite(s)));
      await addPage(view, NEW_URL, "New arrivals");
      expect(view.server.writesTo(kind), "exactly one committed write").toHaveLength(1);
      expect(view.text(), "saved, reload").toMatch(/saved\. reload to see the latest links\./i);
      expect(openDialogs(view), "no failed-write dialog").toHaveLength(0);
      expect(cardText(view), "the card is still the old state").not.toContain("New arrivals");

      const button = addButton(view);
      expect(disabled(button), '"+ Add page" is disabled until the view is reloaded').toBe(true);
      await view.click(button);
      await view.settle();
      expect(openDialogs(view)).toHaveLength(0);
      expect(view.server.writes, "no second write").toHaveLength(1);

      const reload = () => view.byRole("button", /^reload$/i)[0]!;
      await view.click(reload());
      await view.settle();
      expect(view.text(), "still stale while the read fails").toMatch(/saved\. reload to see the latest links\./i);
      expect(disabled(addButton(view))).toBe(true);

      control.recover();
      await view.click(reload());
      await view.settle();
      expect(view.text()).not.toMatch(/saved\. reload to see/i);
      expect(cardText(view)).toContain("New arrivals");
      expect(disabled(addButton(view))).toBe(false);
      expect(view.server.writes, "still one write").toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------
describe("C8 capacity", () => {
  async function blocked(draft: ReturnType<typeof siteDraft>, message: RegExp) {
    const view = await open(draft);
    const dialog = await openAdd(view);
    expect(view.text(dialog), "the limit is explained").toMatch(message);
    expect(view.text(dialog)).not.toMatch(RAW);
    await fill(view, NEW_URL, "One too many");
    await save(view);
    expect(view.text(theDialog(view) ?? view.root()), "still explained after trying").toMatch(message);
    noWrites(view);
  }
  it("500 links: blocked with the importer's maximum-of-500 message", async () => {
    await blocked(siteDraft({ links: manyLinks(500) }), /maximum of 500 links/i);
  });
  it("source claims at the cap: blocked with \"source records are full\"", async () => {
    const links = manyLinks(60);
    const provenance = userProvenance(links);
    provenance.claims = Array.from({ length: 500 }, (_, i) => ({ ...userProvenance(manyLinks(1)).claims[0]!, id: `00000000-0000-4000-8000-${(0xc1a000 + i).toString(16).padStart(12, "0")}` }));
    await blocked(siteDraft({ links, provenance }), /source records are full/i);
  });
  it("999 recorded changes: blocked with \"source records are full\"", async () => {
    const links = manyLinks(10);
    const provenance = userProvenance(links);
    provenance.operations = Array.from({ length: 999 }, (_, i) => ({
      request_id: `00000000-0000-4000-8000-${(0x0b0000 + i).toString(16).padStart(12, "0")}`,
      entry_id: SITE_ENTRY_ID,
      kind: "user_correction",
      supersedes_claim_id: null,
      note: null,
    })) as never;
    await blocked(siteDraft({ links, provenance }), /source records are full/i);
  });
  it("499 links: the 500th page is still accepted", async () => {
    const view = await open(siteDraft({ links: manyLinks(499) }));
    await addPage(view, NEW_URL);
    expect(sentWrite(view.server, "revise").content.links).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C9 a company without a website", () => {
  it("says to add the company website first and sends nothing", async () => {
    const view = await open(withWebsite(null));
    const dialog = await openAdd(view);
    expect(view.text(dialog)).toMatch(/add the company website first/i);
    expect(view.text(dialog)).not.toMatch(RAW);
    await fill(view, NEW_URL);
    await save(view);
    expect(view.text(theDialog(view) ?? view.root())).toMatch(/add the company website first/i);
    noWrites(view);
  });
  it("the same holds for a company with no entries at all except the missing website", async () => {
    const view = await open(withWebsite(null, null));
    const dialog = await openAdd(view);
    expect(view.text(dialog)).toMatch(/add the company website first/i);
    await fill(view, NEW_URL);
    await save(view);
    noWrites(view);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("C10 nothing else changes", () => {
  it("a saved snapshot keeps \"+ Add page\" as a link to the editor and has no dialog", async () => {
    const view = await openView({ section: "Site Knowledge", snapshot: siteSnapshot(siteDraft()) });
    const page = view.page();
    expect(addPageLinks(page, siteCard(page)!)).toEqual([siteAddHref(COMPANY_ID)]);
    expect(addButtons(view)).toHaveLength(0);
  });
  it("a viewer keeps the link to the editor and gets no dialog", async () => {
    const view = await openView({ section: "Site Knowledge", draft: viewerDraft() });
    const page = view.page();
    expect(addPageLinks(page, siteCard(page)!)).toEqual([siteAddHref(COMPANY_ID)]);
    expect(addButtons(view)).toHaveLength(0);
    expect(importControls(page)).toHaveLength(0);
  });
  it("the closed card has no form controls and \"Import from website\" still opens its own picker after the add dialog", async () => {
    const view = await openSite({ draft: siteDraft(), inventory: FULL_INVENTORY() });
    const page = view.page();
    expect(page.$(siteCard(page)!).find("input,textarea,select").length, "no fields while closed").toBe(0);
    const dialog = await openAdd(view);
    await view.click(cancelButton(view, dialog)!);
    await view.settle();
    const imports = view.byRole("button", /^import from website$/i);
    expect(imports).toHaveLength(1);
    await view.click(imports[0]!);
    await view.settle();
    const dialogs = openDialogs(view);
    expect(dialogs).toHaveLength(1);
    expect(view.nameOf(dialogs[0]!)).toMatch(/import pages from website/i);
    expect(siteCardText(view.page(), siteCard(view.page())!)).toContain(LINKS[0]!.title);
  });
});
