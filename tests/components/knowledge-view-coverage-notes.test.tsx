// Reasons a value is unknown, partial or contested are printed next to it for
// banner stats, social links and both Headquarters fields, for the draft and
// for a saved snapshot, through the real server page.
import { describe, expect, it } from "vitest";
import { COMPANY_NAME } from "../helpers/knowledge-view-fixtures";
import { banner, card, cardText, norm, statGroup, textOf, type Page } from "../helpers/knowledge-view-dom";
import { GENERAL_STATS, openSection, titlesOf } from "../helpers/knowledge-view-spec";
import {
  evidenceDraft,
  evidenceSnapshot,
  type Coverage,
  type EvidenceOptions,
} from "../helpers/knowledge-view-evidence";

const open = {
  draft: (section: Parameters<typeof openSection>[0], opts: EvidenceOptions) =>
    openSection(section, { draft: evidenceDraft(opts) }),
  snapshot: (section: Parameters<typeof openSection>[0], opts: EvidenceOptions) =>
    openSection(section, { snapshot: evidenceSnapshot(opts) }),
};
const cov = (target: string, status: Coverage["status"], reason: string | null): Coverage => ({ target, status, reason });
const stat = (page: Page, label: string) => {
  const el = banner(page, "Company", COMPANY_NAME)!;
  return textOf(page, statGroup(page, el, label, GENERAL_STATS)!);
};
const hq = (page: Page) => cardText(page, card(page, "Headquarters", titlesOf("General Info"))!);
const salesBanner = (page: Page) => textOf(page, banner(page, "Sales & Marketing", COMPANY_NAME)!);

describe.each(["draft", "snapshot"] as const)("coverage reasons (%s)", (source) => {
  // behavioural
  it("a filled Founded stat with conflicting sources shows the conflict and its reason", async () => {
    const page = await open[source]("General Info", {
      coverage: [cov("/company_foundation/year_founded", "conflict", "The homepage says 2014 and a registry says 2012.")],
    });
    const founded = stat(page, "Founded");
    expect(founded).toContain("2014");
    expect(founded).toContain("Conflicting sources — The homepage says 2014 and a registry says 2012.");
  });

  // behavioural
  it("a filled stat that was fully found shows no note", async () => {
    const page = await open[source]("General Info", {
      coverage: [cov("/company_foundation/year_founded", "found", null)],
    });
    expect(stat(page, "Founded")).not.toMatch(/Unknown|Conflicting|Partial|Not found/);
  });

  // behavioural
  it("empty stats with no assessment say 'Unknown · Not assessed'", async () => {
    const page = await open[source]("General Info", {
      coverage: [],
      business: (b) => Object.assign(b.company_foundation, { year_founded: null, employee_count: null, legal_entity_type: null }),
    });
    for (const label of GENERAL_STATS) {
      expect(stat(page, label)).toContain("Unknown · Not assessed");
    }
  });

  // behavioural
  it("empty stats show the reason recorded for them", async () => {
    const page = await open[source]("General Info", {
      coverage: [
        cov("/company_foundation/employee_count", "not_found", "No headcount appears on the checked pages."),
        cov("/company_foundation/legal_entity_type", "partial", "Only the footer was checked."),
      ],
      business: (b) => Object.assign(b.company_foundation, { employee_count: null, legal_entity_type: null }),
    });
    expect(stat(page, "Employees")).toContain("Not found in checked pages — No headcount appears on the checked pages.");
    expect(stat(page, "Legal entity")).toContain("Partial — Only the footer was checked.");
  });

  // behavioural
  it("empty social links show why, in the Sales & Marketing banner", async () => {
    const page = await open[source]("Sales & Marketing", {
      coverage: [cov("/online_presence/social_media_links", "not_checked", "No profile links were looked for.")],
      business: (b) => {
        b.online_presence.social_media_links = [];
      },
    });
    const text = salesBanner(page);
    expect(text).toContain("Social links: Unknown · Not assessed — No profile links were looked for.");
  });

  // behavioural
  it("partly found social links keep their links and show the partial note", async () => {
    const page = await open[source]("Sales & Marketing", {
      coverage: [cov("/online_presence/social_media_links", "partial", "Only the footer was checked.")],
    });
    const text = salesBanner(page);
    expect(text).toContain("harborandpinecoffee");
    expect(text).toContain("Partial — Only the footer was checked.");
  });

  // behavioural
  it("Headquarters with a main address but no other locations shows why the others are empty", async () => {
    const page = await open[source]("General Info", {
      coverage: [cov("/company_foundation/other_locations", "not_found", "No other sites are listed.")],
      business: (b) => {
        b.company_foundation.other_locations = [];
      },
    });
    const text = hq(page);
    expect(text).toContain("212 Wharf Street");
    expect(text).toContain("Other locations: Not found in checked pages — No other sites are listed.");
  });

  // behavioural
  it("Headquarters with other locations but no main address shows why the main one is empty", async () => {
    const page = await open[source]("General Info", {
      coverage: [cov("/company_foundation/main_address", "conflict", "Two different addresses were found.")],
      business: (b) => {
        b.company_foundation.main_address = null;
      },
    });
    expect(hq(page)).toContain("Main address: Conflicting sources — Two different addresses were found.");
  });

  // behavioural
  it("an empty Headquarters card shows the reason for both fields", async () => {
    const page = await open[source]("General Info", {
      coverage: [
        cov("/company_foundation/main_address", "not_found", "No street address on the checked pages."),
        cov("/company_foundation/other_locations", "not_checked", "Location pages were not crawled."),
      ],
      business: (b) => {
        b.company_foundation.main_address = null;
        b.company_foundation.other_locations = [];
      },
    });
    const text = norm(hq(page));
    expect(text).toContain("No headquarters yet");
    expect(text).toContain("Main address: Not found in checked pages — No street address on the checked pages.");
    expect(text).toContain("Other locations: Unknown · Not assessed — Location pages were not crawled.");
  });
});
