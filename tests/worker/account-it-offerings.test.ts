import { describe, expect, it } from "vitest";
import { runAccountIt } from "./account-it-run";

const services = ["/services", "/services/tax-preparation-planning", "/services/accounting-bookkeeping", "/services/irs-tax-problems", "/services/quickbooks", "/services/payroll"];
const named = (result: ReturnType<typeof runAccountIt>, name: string) => result.offerings.find((offering) => offering.name === name);
const featureTexts = (result: ReturnType<typeof runAccountIt>, name: string) => (named(result, name)?.features ?? []).map((feature) => feature.text);

describe("offerings from a captured small-business site", () => {
  const result = runAccountIt([...services, "/about-us/doug-cohen", "/firm-background"]);

  it("keeps every 'Term - description' paragraph as a feature", () => {
    const features = featureTexts(result, "IRS Tax Problems");
    expect(features).toEqual(expect.arrayContaining(["IRS Audit Notification", "Liens"]));
    expect(features.filter((text) => /^(?:Wage Garnishment|Bank Levy|Threatening Letters|Non-Filing|Offers-in-Compromise|Innocent Spouse) - /.test(text))).toHaveLength(6);
  });

  it("keeps sub-list items as features, not top-level offerings, and never names an offering from a sentence", () => {
    const names = result.offerings.map((offering) => offering.name);
    expect(names).not.toContain("Business Start-Ups");
    expect(names).not.toContain("Gift & Estate Tax Return Preparation");
    expect(names).not.toContain("part-time or interim financial and accounting services");
    expect(featureTexts(result, "Tax Preparation & Planning")).toEqual(expect.arrayContaining(["Business Start-Ups", "Gift & Estate Tax Return Preparation"]));
  });

  it("turns a prose list on the offering's own page into features", () => {
    expect(featureTexts(result, "Accounting & Bookkeeping")).toEqual(expect.arrayContaining([
      "accounts payable/receivable", "payroll", "general ledger accounting", "bank reconciliations",
      "financial statement preparation", "financial analysis",
    ]));
  });

  it("takes the category from the site's own grouping, never from a parent offering", () => {
    expect(named(result, "Accounting & Bookkeeping")?.category).toBe("Business Services");
    expect(named(result, "IRS Tax Problems")?.category).toBe("IRS Representation");
    expect(named(result, "Tax Preparation & Planning")?.category).toBe("Tax Services");
    expect(result.offerings.map((offering) => offering.category)).not.toContain("Tax Preparation & Planning");
  });

  it("splits a list-like buyer sentence and merges near-duplicate buyers", () => {
    expect(result.buyers).toEqual(expect.arrayContaining(["brand-new businesses", "those nearing retirement", "small businesses with 1 to 10 employees"]));
    expect(result.buyers.filter((buyer) => /^start-ups?(?: business)?$/i.test(buyer))).toHaveLength(1);
  });
});
