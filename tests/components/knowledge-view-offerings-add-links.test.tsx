// Business Offerings: a detail field's "+ Add" opens the editor on the SELECTED offering
// (entryId), never on the first one; the section-level "Add offering" stays unscoped.
// Draft and saved snapshot, through the real server page.
import { describe, expect, it } from "vitest";
import { COMPANY_ID } from "../helpers/knowledge-view-fixtures";
import { norm, type Page } from "../helpers/knowledge-view-dom";
import { addLinksOf, labelGroup } from "../helpers/knowledge-view-offerings-brand-dom";
import { openOfferings } from "../helpers/knowledge-view-offerings-brand-render";
import {
  OFFERING_IDS,
  offeringAddHref,
  offeringsDraft,
  offeringsSnapshot,
} from "../helpers/knowledge-view-offerings-brand-fixtures";

const DETAIL = ["Offering", "Type", "Description", "Key features", "Cost", "Pricing model"];
const ADD = offeringAddHref(COMPANY_ID);
const scoped = (id: string) => `${ADD}&entryId=${id}`;
const open = {
  draft: (offering?: string) => openOfferings({ draft: offeringsDraft(), offering }),
  snapshot: (offering?: string) => openOfferings({ snapshot: offeringsSnapshot(), offering }),
};
const detailAdds = (page: Page) =>
  Object.fromEntries(DETAIL.map((label) => [label, addLinksOf(page, labelGroup(page, label, DETAIL)!)]));
const addOffering = (page: Page) =>
  page.$("a[href]").toArray()
    .filter((a) => /^\+?\s*add offering$/i.test(norm(page.$(a).text())))
    .map((a) => page.$(a).attr("href"));

describe.each(["draft", "snapshot"] as const)("offering add links (%s)", (source) => {
  // behavioural
  it("with the fourth offering selected, every detail Add link carries the fourth offering's entry id", async () => {
    const page = await open[source](OFFERING_IDS[3]);
    const adds = detailAdds(page);
    // The unnamed offering has no name, type, features, cost or pricing model; only its description is filled.
    for (const label of ["Offering", "Type", "Key features", "Cost", "Pricing model"]) {
      expect(adds[label], `card "${label}"`).toEqual([scoped(OFFERING_IDS[3])]);
    }
    expect(adds.Description).toEqual([]);
    expect(JSON.stringify(adds)).not.toContain(OFFERING_IDS[0]);
  });

  // behavioural
  it("each other offering's Add links carry its own entry id", async () => {
    const page = await open[source](OFFERING_IDS[2]);
    const adds = detailAdds(page);
    expect(adds["Key features"]).toEqual([scoped(OFFERING_IDS[2])]);
    expect(adds["Pricing model"]).toEqual([scoped(OFFERING_IDS[2])]);
  });

  // behavioural
  it("the first offering's Add links carry the first offering's id too", async () => {
    const page = await open[source](undefined);
    const filled = detailAdds(page);
    expect(Object.values(filled).flat()).toEqual([]);
    const second = detailAdds(await open[source](OFFERING_IDS[1]));
    expect(Object.values(second).flat()).toEqual([]);
  });

  // behavioural
  it("the section-level Add offering link stays unscoped", async () => {
    for (const offering of [undefined, OFFERING_IDS[3]]) {
      expect(addOffering(await open[source](offering))).toEqual([ADD]);
    }
  });

  // behavioural
  it("every Add link on the page is an editor link on the offering category, scoped only where it belongs to a field", async () => {
    const page = await open[source](OFFERING_IDS[3]);
    const hrefs = page.$(".knowledge-view__panel a[href]").toArray().map((a) => page.$(a).attr("href")!).filter((h) => h.includes("category=offering"));
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      expect([ADD, scoped(OFFERING_IDS[3])]).toContain(href);
    }
  });
});
