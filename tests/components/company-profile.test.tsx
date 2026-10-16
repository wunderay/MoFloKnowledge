import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createEmptyProvenance, createEntryDefault } from "../../src/contracts";
vi.mock("../../src/components/citation-popover", () => ({
  CitationPopover: ({ path }: { path: string }) => React.createElement("button", { "data-evidence-path": path }, "Sources"),
  safeHref: (value: string) => value,
}));
import { CompanyProfile, passagePreview } from "../../src/components/company-profile";

it("groups a company's real fields into a readable profile with stable source access and disclosed coverage", () => {
  const provenance = createEmptyProvenance();
  provenance.coverage = [
    { targets: ["/company_foundation/employee_count"], status: "not_checked", job_id: null, reason: "No employee count was assessed." },
    { targets: ["/company_foundation/industry"], status: "partial", job_id: null, reason: "Only the homepage was checked." },
    { targets: ["/company_foundation/legal_entity_type"], status: "not_found", job_id: null, reason: "No explicit legal entity label in checked pages." },
  ];
  const entries = [{
    id: "company-entry", kind: "company_foundation" as const,
    content: { ...createEntryDefault("company_foundation"), overview: "Exact source overview.", industry: "Accounting", year_founded: 2003,
      company_role: [{ id: "role-id", text: "Service provider" }] },
    provenance, review_status: "unreviewed" as const,
  }, {
    id: "market-entry", kind: "market_and_customers" as const,
    content: { ...createEntryDefault("market_and_customers"),
      target_buyers: [{ id: "buyer-id", text: "Individuals and businesses" }],
      ctas: [{ id: "cta-id", label: "Schedule appointment", url: "https://example.com/appointment", purpose: null }] },
    provenance: createEmptyProvenance(), review_status: "unreviewed" as const,
  }];
  const before = structuredClone(entries);
  const html = renderToStaticMarkup(<CompanyProfile entries={entries} />);
  expect(html).toContain('aria-label="Company profile sections"');
  expect(html).toContain('href="#profile-company_foundation"');
  expect(html).toContain("Company details");
  expect(html).toContain("Who they serve");
  expect(html).toContain("Observed contact options");
  expect(html).toContain("Exact source overview.");
  expect(html).toContain("Individuals and businesses");
  expect(html).toContain('href="https://example.com/appointment"');
  expect(html).toContain("Coverage &amp; unknowns");
  expect(html).toContain("Employee count — Unknown · Not assessed");
  expect(html).toContain("Industry — Partial");
  expect(html).toContain("Legal entity type — Not found in checked pages");
  expect(html).toContain("Only the homepage was checked.");
  expect(html).not.toContain("No values recorded");
  expect(html).not.toContain(">Text<");
  expect(html.replace(/<[^>]*>/g, "")).not.toContain("buyer-id");
  expect(entries).toEqual(before);
});

it("previews long exact wording without losing its full passage or stable evidence pointer", () => {
  const long = "An exact opening sentence about this service. ".repeat(15) + "A unique final condition must remain available.";
  const provenance = createEmptyProvenance();
  const entries = [{
    id: "offering-entry", kind: "offering" as const,
    content: { ...createEntryDefault("offering", "offering-id"), name: "A generic service", description: long,
      features: [{ id: "feature-id", text: "A distinct stated feature." },
        ...Array.from({ length: 7 }, (_, index) => ({ id: `extra-feature-${index}`, text: `Unique additional feature ${index}.` }))] },
    provenance, review_status: "approved" as const,
  }];
  const html = renderToStaticMarkup(<CompanyProfile entries={entries} />);
  expect(html).toContain("Read full passage");
  expect(html).toContain(long);
  expect(html.indexOf("Read full passage")).toBeLessThan(html.indexOf("A unique final condition"));
  expect(passagePreview(long).length).toBeLessThanOrEqual(360);
  expect(long.startsWith(passagePreview(long))).toBe(true);
  expect(html).toContain('data-evidence-path="/offerings/@offering-id/description"');
  expect(html).toContain('data-evidence-path="/offerings/@offering-id/features/@feature-id/text"');
  expect(html).toContain("A distinct stated feature.");
  expect(html).toContain("Show 2 more items · 8 total");
  expect(html).toContain("Unique additional feature 6.");
  expect(html).toContain('data-evidence-path="/offerings/@offering-id/features/@extra-feature-6/text"');
  expect(entries[0]!.content.description).toBe(long);
});

it.each([
  ["offering", "offerings"],
  ["key_person", "key_people"],
] as const)("keeps the %s name's source accessible beside its title", (kind, collection) => {
  const entries = [{
    id: "entry-id", kind,
    content: { ...createEntryDefault(kind, "stable-id"), name: "Source-backed name" },
    provenance: createEmptyProvenance(), review_status: "unreviewed" as const,
  }];
  const html = renderToStaticMarkup(<CompanyProfile entries={entries} />);
  const heading = html.match(/<h3>.*?<\/h3>/)?.[0];
  expect(heading).toContain("Source-backed name");
  expect(heading).toContain(`data-evidence-path="/${collection}/@stable-id/name"`);
});
