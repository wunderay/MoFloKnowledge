import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";

function extract(body: string) {
  const url = "https://acme-group.example.com/";
  const page = { id: "33333333-3333-4333-8333-333333333333", retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  const observations = technicalObservations(page);
  const validated = validateCandidates(deterministicCandidates(page, observations), page, observations, "11111111-1111-4111-8111-111111111111");
  return (field: string) => validated.filter((candidate) => candidate.field === field).flatMap((candidate) => candidate.value as unknown[]);
}

describe("identity and call-to-action guards", () => {
  it.each(["Welcome Home", "Our Story", "Get Started Today", "Your Trusted Partner", "Bee Cave Plumbing", "Johnson Family Dentistry"])(
    "takes no industry from the home heading %s", (heading) => {
      const values = extract(`<main><h1>${heading}</h1><p>Call for same-day repairs and new installations.</p></main>`);
      expect(values("/company_foundation/industry")).toEqual([]);
      expect(values("/company_foundation/company_role")).toEqual([]);
    });

  it("skips a page label as the title brand and uses the next segment", () => {
    const values = extract(`<html><head><title>Home | Acme Group</title></head><body>
      <main><h1>Home Sweet Home</h1><p>Local guidance.</p></main><footer><p>© Acme Group</p></footer></body></html>`);
    const names = (values("/company_foundation/alternative_company_names") as { text: string }[]).map((name) => name.text);
    expect(names).toEqual(["Acme Group"]);
  });

  it("keeps a repeated call-to-action label once and drops a bare read-more label", () => {
    const cards = [1, 2, 3, 4, 5].map((n) => `<article><a href="/post-${n}">Read more</a><a href="/p${n}">Learn More</a></article>`).join("");
    const values = extract(`<main><h1>News</h1>${cards}<a href="/a">View Listings</a><a href="/b">view listings</a></main>`);
    const labels = (values("/market_and_customers/ctas") as { label: string }[]).map((cta) => cta.label);
    expect(labels).toEqual(["View Listings"]);
  });
});
