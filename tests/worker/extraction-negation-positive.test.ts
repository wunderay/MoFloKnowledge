import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { marketTextCandidates } from "../../src/worker/extract/market-text";
import { serviceTextCandidates } from "../../src/worker/extract/services-text";
import { isExplicitServiceProviderSentence } from "../../src/worker/extract/source-excerpts";

function page(body: string, path: string) {
  const url = "https://example.com" + path;
  const p = { id: "33333333-3333-4333-8333-333333333333", retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  return { p, observations: technicalObservations(p) };
}
const texts = (candidates: { field: string; value: unknown }[], suffix: string) =>
  candidates.filter((c) => c.field.endsWith(suffix)).flatMap((c) => c.value as { text: string }[]).map((v) => v.text);

describe("negation words that are not exclusions", () => {
  it("keeps features such as 'without downtime' and 'no obligation'", () => {
    const { p, observations } = page(`<main><h1>Pump Repair</h1><p>We repair pumps for local factories.</p>
      <ul><li>Repairs without downtime</li><li>Free quote, no obligation</li></ul></main>`, "/services/pump-repair");
    const features = texts(serviceTextCandidates(p, observations), "/features").join(" | ");
    expect(features).toContain("Repairs without downtime");
    expect(features).toContain("Free quote, no obligation");
  });

  it("keeps a buyer in 'grow without hiring staff'", () => {
    const { p, observations } = page(`<main><h1>Planning</h1><p>We help small businesses grow without hiring staff.</p></main>`, "/services/advice");
    expect(texts(marketTextCandidates(p, observations), "/target_buyers")).toContain("small businesses");
  });

  it("keeps the company's own profiles whose names contain client or partner", () => {
    const { p, observations } = page(`<footer><a href="https://www.facebook.com/clientco">Client Co on Facebook</a>
      <a href="https://www.linkedin.com/company/smith-partners">Smith &amp; Partners on LinkedIn</a>
      <a href="https://www.linkedin.com/company/clientservices-inc">Client Services</a></footer>`, "/");
    const profiles = deterministicCandidates(p, observations).filter((c) => c.field === "/online_presence/social_media_links")
      .flatMap((c) => c.value as { profile_url: string }[]).map((s) => s.profile_url);
    expect(profiles).toEqual(["https://www.facebook.com/clientco", "https://www.linkedin.com/company/smith-partners",
      "https://www.linkedin.com/company/clientservices-inc"]);
  });

  it("still recognizes provider sentences that say 'without downtime' or 'with no hidden fees'", () => {
    expect(isExplicitServiceProviderSentence("We provide repair services without downtime.")).toBe(true);
    expect(isExplicitServiceProviderSentence("We provide repair services with no hidden fees.")).toBe(true);
  });
});
