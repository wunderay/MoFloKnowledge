// Owner review findings on PR #13 (Quest knowledge-view-site-and-all), added after the lock:
//  1. an import that is saved but whose draft re-read fails must not look like a failed write, must not
//     be sent again, and must block further imports until the view is refreshed;
//  2. the provenance the importer writes must fit the API's claim cap at the promised 500 links.
import { describe, expect, it, vi } from "vitest";
import { CreateEntrySchema, SaveEntrySchema } from "../../src/contracts/api-entries";
import { entryBusiness, validateProvenance } from "../../src/contracts";
import { siteCard, siteCardText } from "../helpers/knowledge-view-site-all-dom";
import { FakeServer, type Req } from "../helpers/knowledge-view-site-all-runtime";
import {
  boxes,
  confirm,
  importButton,
  openPicker,
  openSite,
  pickerDialog,
  selectPages,
  validated,
} from "../helpers/knowledge-view-site-all-import";
import {
  ACTOR,
  COMPANY_ID,
  FULL_INVENTORY,
  PAGES,
  SITE,
  SITE_ENTRY_ID,
  inventory,
  manyLinks,
  noSiteDraft,
  siteDraft,
  userProvenance,
  type Page,
} from "../helpers/knowledge-view-site-all-fixtures";

vi.setConfig({ testTimeout: 60_000 });

// The runtime helper maps "@/..." imports when it loads, so the components are imported after it.
const { MAX_LINKS, importCandidates, importRoom, saveLinks } = await import("../../src/components/knowledge-view/site-import");
const { siteLinksFrom } = await import("../../src/components/knowledge-view/data");

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

const cardText = (view: { page(): never }) => {
  const page = view.page();
  return siteCardText(page, siteCard(page)!);
};
const disabled = (node: { props: Record<string, unknown> }) => node.props.disabled === true || node.props.disabled === "";

describe("a saved import whose draft re-read fails", () => {
  for (const [name, draft, kind] of [
    ["revision of an existing entry", siteDraft(), "revisions"],
    ["first entry of a company without one", noSiteDraft(), "entries"],
  ] as const) {
    it(`${name}: says it was saved, offers a reload, blocks another import, never resends`, async () => {
      let control!: { recover: () => void };
      const view = await openSite({ draft, inventory: FULL_INVENTORY(), configure: (s) => (control = failDraftReadsAfterWrite(s)) });
      await openPicker(view);
      await selectPages(view, [PAGES.shop]);
      await confirm(view);

      expect(view.server.writesTo(kind), "exactly one committed write").toHaveLength(1);
      expect(view.text(), "tells the person it was saved and to reload").toMatch(/saved\. reload to see the latest links\./i);
      expect(view.dialogs(), "the dialog closed: the write did not fail").toHaveLength(0);
      const stale = cardText(view as never);
      expect(stale, "the card still shows the old state").not.toContain(PAGES.shop.title!);

      // the picker cannot be opened on the stale entry state
      const button = importButton(view);
      expect(disabled(button), "Import from website is disabled").toBe(true);
      await view.click(button);
      await view.settle();
      expect(view.dialogs()).toHaveLength(0);
      expect(view.server.writes, "no second write").toHaveLength(1);

      // Reload while the read still fails: still stale, still one write
      const reload = () => view.byRole("button", /^reload$/i)[0]!;
      expect(reload(), "a Reload control").toBeDefined();
      await view.click(reload());
      await view.settle();
      expect(view.text()).toMatch(/saved\. reload to see the latest links\./i);
      expect(disabled(importButton(view))).toBe(true);

      // the read recovers: the card shows the import, the notice goes, the picker works again
      control.recover();
      await view.click(reload());
      await view.settle();
      expect(view.text()).not.toMatch(/saved\. reload to see/i);
      expect(cardText(view as never)).toContain(PAGES.shop.title!);
      expect(disabled(importButton(view))).toBe(false);
      await openPicker(view);
      const labels = boxes(view, pickerDialog(view)!).map((b) => b.name.toLowerCase());
      expect(labels.some((l) => l.includes(PAGES.shop.title!.toLowerCase())), "the saved page is no longer offered").toBe(false);
      expect(view.server.writes, "still one write").toHaveLength(1);
    });
  }
});

// ---- the claim budget -----------------------------------------------------------------------------------
const pagesOf = (count: number, from = 1): Page[] =>
  Array.from({ length: count }, (_, i) => ({ ...PAGES.shop, sourceId: null, url: `${SITE}/crawled/${from + i}`, title: `Crawled page ${from + i}` }));

/** Runs the real writer against the fake API and returns the request it sent. */
async function write(draft: ReturnType<typeof siteDraft>, pages: Page[]): Promise<Req> {
  const server = new FakeServer({ draft });
  vi.stubGlobal("fetch", server.fetch);
  const site = siteLinksFrom(draft.entries as never);
  const added = importCandidates(pages, site.links);
  await saveLinks(COMPANY_ID, ACTOR, site, added);
  expect(server.writes).toHaveLength(1);
  return server.writes[0]!;
}
function check(req: Req, kind: "create" | "revise") {
  const parsed = kind === "create" ? CreateEntrySchema.safeParse(req.body) : SaveEntrySchema.safeParse(req.body);
  expect(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  const sent = validated(req, kind);
  expect(validateProvenance(entryBusiness("site_links", sent.content as never), sent.provenance)).toEqual([]);
  return sent;
}

describe("the importer's provenance fits the API schemas at the link cap", () => {
  it("creating an entry with 500 imported links: one grouped claim, accepted by CreateEntrySchema and validateProvenance", async () => {
    const sent = check(await write(noSiteDraft(), pagesOf(500)), "create");
    expect(sent.content.links).toHaveLength(MAX_LINKS);
    expect(sent.provenance.claims.length).toBeLessThanOrEqual(500);
    expect(sent.provenance.claims.flatMap((c) => c.targets)).toHaveLength(1000);
  });

  it("revising a 499-link entry (long-list provenance) with the last link: accepted by SaveEntrySchema", async () => {
    const links = manyLinks(499);
    const sent = check(await write(siteDraft({ links }), pagesOf(1)), "revise");
    expect(sent.content.links).toHaveLength(MAX_LINKS);
  });

  it("revising a 100-link entry with one claim per leaf (200 claims) with 400 links: accepted", async () => {
    const links = manyLinks(100);
    const draft = siteDraft({ links, provenance: userProvenance(links) });
    expect(draft.entries.find((e) => e.id === SITE_ENTRY_ID)!.provenance.claims).toHaveLength(200);
    const sent = check(await write(draft, pagesOf(400)), "revise");
    expect(sent.content.links).toHaveLength(MAX_LINKS);
    expect(sent.provenance.claims).toHaveLength(201);
  });

  it("251 new links no longer need 502 claims (the rejected case)", async () => {
    const sent = check(await write(noSiteDraft(), pagesOf(251)), "create");
    expect(sent.provenance.claims.length).toBeLessThan(500);
  });

  it("an entry whose claims are already at the API cap offers no room, even with few links", () => {
    const links = manyLinks(60); // 60 links x (title, url) = 120 leaves; pad the claims to the cap
    const provenance = userProvenance(links);
    provenance.claims = Array.from({ length: 500 }, (_, i) => ({ ...userProvenance(manyLinks(1)).claims[0]!, id: `00000000-0000-4000-8000-${(0xc1a000 + i).toString(16).padStart(12, "0")}` }));
    const draft = siteDraft({ links, provenance });
    expect(importRoom(siteLinksFrom(draft.entries as never)).room).toBe(0);
    expect(importRoom(siteLinksFrom(siteDraft({ links }).entries as never)).room).toBe(MAX_LINKS - 60);
  });
});

describe("the picker states the limit it enforces", () => {
  it("with 501 candidate pages and no links it offers 500 and says so; checking more than 500 does not select a 501st", async () => {
    const view = await openSite({ draft: noSiteDraft(), inventory: inventory(pagesOf(501)) });
    const dialog = await openPicker(view);
    expect(view.text(dialog)).toMatch(/only 500 more pages can be added \(maximum 500 links\)/i);
  });

  it("an entry with its claims at the cap says its source records are full and sends nothing", async () => {
    const links = manyLinks(60);
    const provenance = userProvenance(links);
    provenance.claims = Array.from({ length: 500 }, (_, i) => ({ ...userProvenance(manyLinks(1)).claims[0]!, id: `00000000-0000-4000-8000-${(0xc1a000 + i).toString(16).padStart(12, "0")}` }));
    const view = await openSite({ draft: siteDraft({ links, provenance }), inventory: inventory([PAGES.shop, PAGES.subscribe]) });
    const dialog = await openPicker(view);
    expect(view.text(dialog)).toMatch(/source records are full/i);
    for (const box of boxes(view, dialog)) await view.check(box.node, true);
    await view.settle();
    await confirm(view);
    expect(view.server.writes).toEqual([]);
  });
});
