// Owner review findings on PR #13 (Quest knowledge-view-site-and-all), added after the lock:
//  1. an import that is saved but whose draft re-read fails must not look like a failed write, must not
//     be sent again, and must block further imports until the view is refreshed;
//  2. the provenance the importer writes must fit the API's claim cap at the promised 500 links.
import { describe, expect, it, vi } from "vitest";
import { CreateEntrySchema, SaveEntrySchema } from "../../src/contracts/api-entries";
import { EntryProvenanceSchema, createEmptyProvenance, entryBusiness, parseBusinessEntry, validateProvenance } from "../../src/contracts";
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
  type Link,
  type Page,
} from "../helpers/knowledge-view-site-all-fixtures";

vi.setConfig({ testTimeout: 60_000 });

// The runtime helper maps "@/..." imports when it loads, so the components are imported after it.
const { MAX_LINKS, importCandidates, importRoom, saveLinks } = await import("../../src/components/knowledge-view/site-import");
const { claimsForLeaves } = await import("../../src/knowledge/revise-provenance");
const { prepareManualCreation, prepareRevision } = await import("../../src/server/revisions");
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
// The browser's provenance is not stored: the server rebuilds it (prepareManualCreation for a new entry,
// prepareRevision for a revision). These tests send the importer's real request through those functions
// and validate what they would store against the contracts, including the 500-claim cap.
const ACTOR_ID = ACTOR;
const pagesOf = (count: number, from = 1): Page[] =>
  Array.from({ length: count }, (_, i) => ({ ...PAGES.shop, sourceId: null, url: `${SITE}/crawled/${from + i}`, title: `Crawled page ${from + i}` }));

/** Runs the real client writer against the fake API and returns the request it sent. */
async function sentBy(draft: ReturnType<typeof siteDraft>, pages: Page[]): Promise<Req> {
  const server = new FakeServer({ draft });
  vi.stubGlobal("fetch", server.fetch);
  const site = siteLinksFrom(draft.entries as never);
  await saveLinks(COMPANY_ID, ACTOR, site, importCandidates(pages, site.links));
  expect(server.writes).toHaveLength(1);
  return server.writes[0]!;
}
const stored = (provenance: unknown) => {
  const parsed = EntryProvenanceSchema.safeParse(provenance);
  expect(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), "within the stored provenance contract (500 claims)").toEqual([]);
  return provenance as ReturnType<typeof createEmptyProvenance>;
};
/** The provenance the server would store for a first entry made from this request. */
async function created(pages: Page[]) {
  const req = await sentBy(noSiteDraft(), pages);
  const body = CreateEntrySchema.parse(req.body);
  const content = parseBusinessEntry("site_links", body.content) as { links: Link[] };
  const provenance = stored(prepareManualCreation(body.kind, body.content, body.requestId, ACTOR_ID));
  expect(validateProvenance(entryBusiness("site_links", content as never), provenance)).toEqual([]);
  return { content, provenance };
}
/** The provenance the server would store for a revision made from this request onto `draft`'s entry. */
async function revised(draft: ReturnType<typeof siteDraft>, pages: Page[]) {
  const req = await sentBy(draft, pages);
  const body = SaveEntrySchema.parse(req.body);
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
  const out = await prepareRevision(client as never, COMPANY_ID, SITE_ENTRY_ID, ACTOR_ID, body as never);
  const provenance = stored(out.provenance);
  expect(validateProvenance(entryBusiness("site_links", out.content as never), provenance)).toEqual([]);
  return { content: out.content as { links: Link[] }, provenance };
}

describe("what the server stores for an import fits the contract at the link cap", () => {
  it("creating an entry with 500 imported links stores 1000 targets in one claim", async () => {
    const { content, provenance } = await created(pagesOf(500));
    expect(content.links).toHaveLength(MAX_LINKS);
    expect(provenance.claims.length).toBe(claimsForLeaves(2 * MAX_LINKS));
    expect(provenance.claims.flatMap((c) => c.targets)).toHaveLength(2 * MAX_LINKS);
  });

  it("251 new links no longer need 502 claims (the case the review found)", async () => {
    const { provenance } = await created(pagesOf(251));
    expect(provenance.claims.length).toBe(1);
  });

  it("revising a 499-link entry (grouped provenance) with the last link", async () => {
    const { content } = await revised(siteDraft({ links: manyLinks(499) }), pagesOf(1));
    expect(content.links).toHaveLength(MAX_LINKS);
  });

  it("revising a 100-link legacy entry with one claim per leaf (200 claims) with 400 links keeps its claims and adds one", async () => {
    const links = manyLinks(100);
    const draft = siteDraft({ links, provenance: userProvenance(links) });
    const before = draft.entries.find((e) => e.id === SITE_ENTRY_ID)!.provenance;
    expect(before.claims).toHaveLength(200);
    const { content, provenance } = await revised(draft, pagesOf(400));
    expect(content.links).toHaveLength(MAX_LINKS);
    expect(provenance.claims).toHaveLength(201);
    expect(provenance.claims.slice(0, 200).map((c) => c.id)).toEqual(before.claims.map((c) => c.id));
  });

  it("the editor's own save path (prepareManualCreation of a 300-link list) is grouped too", () => {
    const grouped = prepareManualCreation("site_links" as never, { links: manyLinks(300) } as never, "22222222-2222-4222-8222-222222222222", ACTOR_ID);
    expect(grouped.claims).toHaveLength(1);
    stored(grouped);
  });

  it("501 links are refused by the content contract; the picker never builds them", () => {
    expect(() => parseBusinessEntry("site_links", { links: manyLinks(501) })).toThrow();
    expect(() => parseBusinessEntry("site_links", { links: manyLinks(500) })).not.toThrow();
  });

  it("importRoom follows the claim budget: legacy 250 links x 2 leaves = 500 claims leaves no room, 400 claims leaves 100 pages of claims but 250 of links", () => {
    const full = (n: number) => {
      const links = manyLinks(n);
      const provenance = userProvenance(links);
      return siteLinksFrom(siteDraft({ links, provenance: { ...provenance, claims: Array.from({ length: Math.min(500, 2 * n) }, (_, i) => ({ ...userProvenance(manyLinks(1)).claims[0]!, id: `00000000-0000-4000-8000-${(0xc1a000 + i).toString(16).padStart(12, "0")}` })) } }).entries as never);
    };
    expect(importRoom(full(250))).toEqual({ room: 0, limit: "claims" });
    expect(importRoom(full(100))).toEqual({ room: 400, limit: null });
    expect(importRoom(siteLinksFrom(siteDraft({ links: manyLinks(60) }).entries as never))).toEqual({ room: MAX_LINKS - 60, limit: null });
  });
});

describe("the picker states the limit it enforces", () => {
  it("with 501 candidate pages and no links it offers 500 and says so", async () => {
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
