// Accessible names of the evidence controls: an item's control is named by the
// item's own text and its visible origin, never by a raw id; ids that merely
// start alike do not share markers. Draft and saved snapshot, through the real page.
import { describe, expect, it } from "vitest";
import { card, deepestContaining, norm, type Page } from "../helpers/knowledge-view-dom";
import { LOCKED_SECTIONS, openSection, titlesOf, type LockedSection } from "../helpers/knowledge-view-spec";
import {
  ITEM_MARKS,
  buildEvidence,
  evidenceDraft,
  evidenceSnapshot,
  markOf,
  refillLists,
  type EvidenceOptions,
} from "../helpers/knowledge-view-evidence";
import type { Business } from "../../src/contracts";

const open = {
  draft: (section: LockedSection, opts: EvidenceOptions) =>
    openSection(section, { draft: evidenceDraft({ business: refillLists, ...opts }) }),
  snapshot: (section: LockedSection, opts: EvidenceOptions) =>
    openSection(section, { snapshot: evidenceSnapshot({ business: refillLists, ...opts }) }),
};
const names = (page: Page) =>
  page.$("button.citation-popover__trigger").toArray().map((b) => ({
    name: page.$(b).attr("aria-label") ?? "",
    visible: norm(page.$(b).text()).replace(/ ⓘ$/, ""),
  }));
/** What the item's control is named after: the text the item shows. */
const NAME: Record<string, (b: Business) => string> = {
  Buyers: (b) => b.market_and_customers.target_buyers[1]!.text,
  Suppliers: (b) => b.market_and_customers.suppliers_and_partners[1]!.name!,
  "Industry groupings": (b) => b.market_and_customers.industry_groupings[1]!.text,
  "Service locations": (b) => b.company_foundation.service_locations[1]!.text,
  "Company role": (b) => b.company_foundation.company_role[1]!.text,
  "Industry outlook": (b) => b.market_and_customers.industry_outlook[1]!.text,
  "Alternate names": (b) => b.company_foundation.alternative_company_names[1]!.text,
  Headquarters: (b) => b.company_foundation.other_locations[1]!.label!,
  "Customer needs": (b) => b.market_and_customers.customer_needs[1]!.text,
  Channels: (b) => b.market_and_customers.channels[1]!.label!,
  "Calls to action": (b) => b.market_and_customers.ctas[1]!.label,
  Funnels: (b) => b.market_and_customers.funnels[1]!.name!,
  "Ideal persona": (b) => b.market_and_customers.ideal_customer_personas[1]!.name!,
};

describe.each(["draft", "snapshot"] as const)("evidence control names (%s)", (source) => {
  // behavioural
  it.each(ITEM_MARKS.map((m) => [m.card, m] as const))("%s: the item marker is named by its origin and its text", async (title, m) => {
    const opts = { marks: [markOf(m, 1)] };
    const page = await open[source](m.section, opts);
    const { business } = buildEvidence({ business: refillLists, ...opts });
    const item = NAME[title]!(business);
    const marker = names(page).filter((n) => n.name.includes(item));
    expect(marker).toHaveLength(1);
    expect(marker[0]!.name).toContain(m.label);
    expect(marker[0]!.name).toBe(`${marker[0]!.visible}: evidence for ${item}`);
  });

  // behavioural
  it.each(LOCKED_SECTIONS)("%s: no evidence control is named by a raw id", async (section) => {
    const marks = ITEM_MARKS.filter((m) => m.section === section).map((m) => markOf(m, 1));
    const page = await open[source](section, { marks });
    const all = names(page);
    expect(all.length).toBeGreaterThan(marks.length);
    for (const { name } of all) expect(name).not.toContain("@");
  });

  // behavioural
  it("Edge case: social-link controls are named by platform, field controls keep their field name", async () => {
    const page = await open[source]("Sales & Marketing", {});
    const all = names(page).map((n) => n.name);
    expect(all.filter((n) => /: evidence for Instagram$/.test(n))).toHaveLength(1);
    expect(all).toContain("Evidence for company pitch");
  });
});

describe("ids that start alike", () => {
  // behavioural (draft only: a snapshot requires UUID ids, which cannot be prefixes of each other)
  it("a claim on item id 'buyer-10' puts no marker on item 'buyer-1'", async () => {
    const buyers = (b: Business) => {
      b.market_and_customers.target_buyers = [
        { id: "buyer-1", text: "First buyer" },
        { id: "buyer-10", text: "Tenth buyer" },
      ];
    };
    const page = await openSection("Customers & Industry", {
      draft: evidenceDraft({
        business: buyers,
        marks: [{ target: () => "/market_and_customers/target_buyers/@buyer-10/text", origin: "inferred" }],
      }),
    });
    const el = card(page, "Buyers", titlesOf("Customers & Industry"))!;
    const markerOf = (text: string) =>
      page.$(deepestContaining(page, el, text)[0]!).closest("li").children(".citation-popover").length;
    expect(markerOf("First buyer")).toBe(0);
    expect(markerOf("Tenth buyer")).toBe(1);
  });
});
