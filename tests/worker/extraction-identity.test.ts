import { describe, expect, it } from "vitest";
import row from "../fixtures/account-it-identity/home.json";
import type { StoredCapture } from "../../src/worker/crawl/run-crawl";
import type { PageCapture } from "../../src/worker/capture/html";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { technicalObservations } from "../../src/worker/extract/observations";
import { nearDuplicateColor } from "../../src/worker/extract/colors";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";

const observations = row.observations as unknown as Record<string, unknown>;
const page: StoredCapture = {
  id: "33333333-3333-4333-8333-333333333333",
  retrievedAt: "2026-10-16T00:00:00Z",
  capture: {
    normalizedUrl: row.normalized_url, finalUrl: row.final_url, title: row.title,
    author: null, publisher: null, publishedAt: null, updatedAt: null,
    segments: observations.segments as PageCapture["segments"],
    text: row.cleaned_content, contentHash: "fixture", observations,
    links: observations.links as PageCapture["links"], requiresRender: false, truncated: false,
  },
};
const observed = technicalObservations(page);
const candidates = deterministicCandidates(page, observed);
const values = (field: string) => candidates.filter((c) => c.field === field).flatMap((c) => c.value as unknown[]);

describe("identity extraction from a captured business page", () => {
  it("validates every candidate", () => {
    expect(validateCandidates(candidates, page, observed, "11111111-1111-4111-8111-111111111111"))
      .toHaveLength(candidates.length);
  });
  it("takes the declared business name as an alternative name", () => {
    expect(values("/company_foundation/alternative_company_names"))
      .toEqual([{ text: "Account-it Consulting Services, LLC" }]);
  });
  it("skips a declared name that is only the site's own name", () => {
    const jsonLd = [{ "@type": "LocalBusiness", url: "https://account-it.net", name: "Account-it, LLC", telephone: "02 9374 4000" }];
    const own = { ...page, capture: { ...page.capture, observations: { ...observations, jsonLd } } };
    const found = deterministicCandidates(own, technicalObservations(own));
    expect(found.filter((c) => c.field === "/company_foundation/alternative_company_names")).toEqual([]);
    expect(found.filter((c) => c.field === "/online_presence/phone")).toEqual([]);
  });
  it("takes the declared telephone as the company phone", () => {
    expect(values("/online_presence/phone")).toEqual(["9545928630"]);
  });
  it("strips tracking parameters and keeps a personal profile out of the company links", () => {
    expect(values("/online_presence/social_media_links")).toEqual([
      { platform: "facebook", profile_url: "https://www.facebook.com/account.itconsulting/" },
    ]);
    expect(observed).toContainEqual(expect.objectContaining({
      property: "personal-linkedin-profile", value: "https://www.linkedin.com/in/doug-cohen-9121a86/",
    }));
  });
  it("reports only explicit channels and no navigation link as a call to action", () => {
    expect(values("/market_and_customers/channels")).toEqual([
      { channel_type: "Email", label: "dougc@account-it.net", url: null },
      { channel_type: "Newsletter", label: "Email newsletter", url: "https://account-it.net/" },
      { channel_type: "Contact form", label: "Website contact form", url: "https://account-it.net/contact" },
    ]);
    const labels = values("/market_and_customers/ctas").map((cta) => (cta as { label: string }).label);
    expect(labels).toEqual(expect.arrayContaining(["Schedule Appointment", "Get started"]));
    expect(labels).not.toContain("Referrals");
  });
  it("drops overlay colours", () => {
    expect(values("/branding_and_style/brand_colors").map((c) => (c as { hex: string; alpha: number }).hex).sort())
      .toEqual(["#1F2937", "#2E2E2E", "#898989"]);
    expect(nearDuplicateColor("#898989", "#8A8A8A")).toBe(true);
    expect(nearDuplicateColor("#898989", "#1F2937")).toBe(false);
  });
});
