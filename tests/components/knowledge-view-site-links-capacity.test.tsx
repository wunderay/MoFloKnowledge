// Acceptance: the picker's real capacity, the duplicate-URL key and the
// disabled boxes at the limit. The server-side 409 mapping is in tests/server/http-singleton-conflict.test.ts.
import { describe, expect, it, vi } from "vitest";
import { boxFor, boxes, openPicker, openSite, pickerDialog, selectPages } from "../helpers/knowledge-view-site-all-import";
import { PAGES, SITE, inventory, manyLinks, siteDraft, userProvenance } from "../helpers/knowledge-view-site-all-fixtures";

vi.setConfig({ testTimeout: 30_000 });

const { importCandidates, importRoom } = await import("../../src/components/knowledge-view/site-import");
const { siteLinksFrom } = await import("../../src/components/knowledge-view/data");

const captured = (url: string) => ({ ...PAGES.shop, url, title: url });
const stored = (url: string) => ({ id: "00000000-0000-4000-8000-0000000000f1", title: "Stored", url, note: null });
const disabled = (node: { props: Record<string, unknown> }) => node.props.disabled === true || node.props.disabled === "";

describe("capacity", () => {
  it("room is what the links and the source claims still allow: 20 links with 450 claims leave 480", () => {
    const links = manyLinks(20);
    const base = userProvenance(links);
    const claim = userProvenance(manyLinks(1)).claims[0];
    const claims = Array.from({ length: 450 }, (_, i) => ({ ...claim, id: `00000000-0000-4000-8000-${(0xc1a000 + i).toString(16).padStart(12, "0")}` }));
    const site = siteLinksFrom(siteDraft({ links, provenance: { ...base, claims } }).entries as never);
    expect(importRoom(site)).toEqual({ room: 480, limit: null });
  });
});

describe("the duplicate-URL key", () => {
  it("/a, /a/ and /a#x are one candidate", () => {
    const pages = [captured(`${SITE}/a`), captured(`${SITE}/a/`), captured(`${SITE}/a#x`)] as never;
    expect(importCandidates(pages, [])).toHaveLength(1);
  });
  it("a stored /a hides /a/ and /a#x, and a stored /b/ hides /b", () => {
    const pages = [captured(`${SITE}/a/`), captured(`${SITE}/a#x`), captured(`${SITE}/b`), captured(`${SITE}/c`)] as never;
    const urls = importCandidates(pages, [stored(`${SITE}/a`), stored(`${SITE}/b/`)]).map((c) => c.url);
    expect(urls).toEqual([`${SITE}/c`]);
  });
  it("a different query string is a different page", () => {
    const pages = [captured(`${SITE}/a?page=1`), captured(`${SITE}/a?page=2`)] as never;
    expect(importCandidates(pages, [])).toHaveLength(2);
  });
});

describe("the picker at the limit", () => {
  it("with 499 links, once one page is checked every other box is disabled and the checked one stays enabled", async () => {
    const view = await openSite({ inventory: inventory([PAGES.shop, PAGES.subscribe, PAGES.workshops]), draft: siteDraft({ links: manyLinks(499) }) });
    await openPicker(view);
    for (const page of [PAGES.shop, PAGES.subscribe, PAGES.workshops]) {
      expect(disabled(boxFor(view, pickerDialog(view)!, page)!)).toBe(false);
    }
    await selectPages(view, [PAGES.shop]);
    const dialog = pickerDialog(view)!;
    expect(disabled(boxFor(view, dialog, PAGES.shop)!), "the checked box can be unchecked").toBe(false);
    expect(disabled(boxFor(view, dialog, PAGES.subscribe)!)).toBe(true);
    expect(disabled(boxFor(view, dialog, PAGES.workshops)!)).toBe(true);
    expect(boxes(view, dialog).filter((b) => !disabled(b.node))).toHaveLength(1);
  });
});
