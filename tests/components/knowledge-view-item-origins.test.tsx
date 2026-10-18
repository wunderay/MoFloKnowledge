// In list fields, the closed view says which ITEM carries a user correction or
// historical generated/inferred wording, and the field's control never lets one
// origin hide another. Draft and saved snapshot, through the real server page.
import { describe, expect, it } from "vitest";
import {
  deepestContaining,
  card,
  norm,
  type Page,
} from "../helpers/knowledge-view-dom";
import { openSection, titlesOf, type CardSection } from "../helpers/knowledge-view-spec";
import {
  ITEM_MARKS,
  buildEvidence,
  evidenceDraft,
  evidenceSnapshot,
  markOf,
  refillLists,
  type EvidenceOptions,
  type ItemMark,
  type Mark,
} from "../helpers/knowledge-view-evidence";
import type { Business } from "../../src/contracts";

const LABEL = { inferred: "Historical inferred ⓘ", user_provided: "User correction ⓘ", generated: "Historical generated · approved ⓘ" } as const;
const open = {
  draft: (section: CardSection, opts: EvidenceOptions) =>
    openSection(section, { draft: evidenceDraft({ business: refillLists, ...opts }) }),
  snapshot: (section: CardSection, opts: EvidenceOptions) =>
    openSection(section, { snapshot: evidenceSnapshot({ business: refillLists, ...opts }) }),
};
/** The text each list item shows, in stored order. */
const SHOWN: Record<string, (b: Business) => string[]> = {
  Buyers: (b) => b.market_and_customers.target_buyers.map((x) => x.text),
  Suppliers: (b) => b.market_and_customers.suppliers_and_partners.map((x) => x.name!),
  "Industry groupings": (b) => b.market_and_customers.industry_groupings.map((x) => x.text),
  "Service locations": (b) => b.company_foundation.service_locations.map((x) => x.text),
  "Company role": (b) => b.company_foundation.company_role.map((x) => x.text),
  "Industry outlook": (b) => b.market_and_customers.industry_outlook.map((x) => x.text),
  "Alternate names": (b) => b.company_foundation.alternative_company_names.map((x) => x.text),
  Headquarters: (b) => b.company_foundation.other_locations.map((x) => x.raw!),
  "Customer needs": (b) => b.market_and_customers.customer_needs.map((x) => x.text),
  Channels: (b) => b.market_and_customers.channels.map((x) => x.label!),
  "Calls to action": (b) => b.market_and_customers.ctas.map((x) => x.label),
  Funnels: (b) => b.market_and_customers.funnels.map((x) => x.name!),
  "Ideal persona": (b) => b.market_and_customers.ideal_customer_personas.map((x) => x.name!),
};
const business = () => buildEvidence({ business: refillLists }).business;

const cardEl = (page: Page, section: CardSection, title: string) => card(page, title, titlesOf(section))!;
/** The list item (chip, row) showing `text`. */
const itemOf = (page: Page, el: ReturnType<typeof cardEl>, text: string) =>
  page.$(deepestContaining(page, el, text)[0]).closest("li");
const markers = (page: Page, li: ReturnType<Page["$"]>) =>
  li.children(".citation-popover").find("button").toArray().map((b) => norm(page.$(b).text()));
/** Every item of the card that carries its own marker, by its shown text. */
const markedItems = (page: Page, el: ReturnType<typeof cardEl>, texts: string[]) =>
  texts.filter((t) => markers(page, itemOf(page, el, t)).length > 0);
// A card's field-level control sits in its header (Headquarters: beside its section labels).
const header = (page: Page, el: ReturnType<typeof cardEl>) =>
  page.$(el).find(".knowledge-view__card-head > .citation-popover button, .knowledge-view__mini-label .citation-popover button").toArray().map((b) => norm(page.$(b).text()));
const headerLabel = (page: Page, section: CardSection, title: string) =>
  header(page, cardEl(page, section, title)).join(" ");

describe.each(["draft", "snapshot"] as const)("per-item origins (%s)", (source) => {
  it.each(ITEM_MARKS.map((m) => [m.card, m] as [string, ItemMark]))(
    "%s: only the item whose own claim is non-source gets a marker",
    async (title, m) => {
      const page = await open[source](m.section, { marks: [markOf(m, 1)] });
      const texts = SHOWN[title](business());
      expect(texts.length).toBeGreaterThan(1);
      const el = cardEl(page, m.section, title);
      expect(markedItems(page, el, texts)).toEqual([texts[1]]);
      expect(markers(page, itemOf(page, el, texts[1]))).toEqual([LABEL[m.origin]]);
      // The field-level control names the origin too.
      expect(headerLabel(page, m.section, title)).toContain(m.label);
    },
  );

  it("4 buyers, inferred only on buyer 2: the marker sits on that chip alone", async () => {
    const m = ITEM_MARKS.find((x) => x.card === "Buyers")!;
    const page = await open[source]("Customers & Industry", { marks: [markOf(m, 1)] });
    const texts = SHOWN.Buyers(business());
    expect(texts).toHaveLength(4);
    const el = cardEl(page, "Customers & Industry", "Buyers");
    expect(texts.map((t) => markers(page, itemOf(page, el, t)))).toEqual([[], [LABEL.inferred], [], []]);
  });

  it("a user correction on buyer 1 does not hide the historical inference on buyer 2", async () => {
    const m = ITEM_MARKS.find((x) => x.card === "Buyers")!;
    const user: Mark = { target: markOf(m, 0).target, origin: "user_provided" };
    const page = await open[source]("Customers & Industry", { marks: [user, markOf(m, 1)] });
    const texts = SHOWN.Buyers(business());
    const el = cardEl(page, "Customers & Industry", "Buyers");
    expect(texts.map((t) => markers(page, itemOf(page, el, t)))).toEqual([[LABEL.user_provided], [LABEL.inferred], [], []]);
    const label = headerLabel(page, "Customers & Industry", "Buyers");
    expect(label).toContain("User correction");
    expect(label).toContain("Historical inferred");
  });

  it("a user correction on persona 1 does not hide the historical generated persona 2", async () => {
    const m = ITEM_MARKS.find((x) => x.card === "Ideal persona")!;
    const user: Mark = { target: markOf(m, 0).target, origin: "user_provided" };
    const four = (b: Business) => {
      refillLists(b);
      b.market_and_customers.ideal_customer_personas.push(
        ...["Persona three", "Persona four"].map((name, i) => ({
          id: `00000000-0000-4000-8000-0000000f300${i}`,
          name,
          role: null,
          organization_type: null,
          goals: [],
          pain_points: [],
        })),
      );
    };
    const page = await open[source]("Sales & Marketing", { business: four, marks: [user, markOf(m, 1)] });
    const texts = SHOWN["Ideal persona"](buildEvidence({ business: four }).business);
    expect(texts).toHaveLength(4);
    const el = cardEl(page, "Sales & Marketing", "Ideal persona");
    expect(texts.map((t) => markers(page, itemOf(page, el, t)))).toEqual([[LABEL.user_provided], [LABEL.generated], [], []]);
    const label = headerLabel(page, "Sales & Marketing", "Ideal persona");
    expect(label).toContain("User correction");
    expect(label).toContain("Historical generated");
  });

  it("Edge case: source-backed items carry no per-item marker; the field control keeps the sources", async () => {
    const m = ITEM_MARKS.find((x) => x.card === "Buyers")!;
    const sourced: Mark = { target: markOf(m, 2).target, origin: "source_backed" };
    const page = await open[source]("Customers & Industry", { marks: [sourced] });
    const el = cardEl(page, "Customers & Industry", "Buyers");
    expect(markedItems(page, el, SHOWN.Buyers(business()))).toEqual([]);
    expect(header(page, el)).toEqual(["Sources ⓘ"]);
  });
});
