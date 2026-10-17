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

describe("extraction negation", () => {
  it("does not turn excluded services into features, but keeps offered ones", () => {
    const { p, observations } = page(`<main><h1>Pump Repair</h1><p>We repair pumps and valves for local factories.</p>
      <p>We provide an inspection report with every repair.</p><ul><li>Seal replacement</li></ul>
      <ul><li>We do not offer emergency night callouts.</li><li>Repairs excluding electrical rewiring</li></ul></main>`, "/services/pump-repair");
    const features = serviceTextCandidates(p, observations).filter((c) => c.field === "/offerings/@id/features")
      .flatMap((c) => c.value as { text: string }[]).map((v) => v.text).join(" | ");
    expect(features).toContain("Seal replacement");
    expect(features).not.toMatch(/night callouts/);
    expect(features).not.toMatch(/electrical rewiring/);
  });

  it("scopes a buyer declaration to its own sentence", () => {
    const { p, observations } = page(`<main><h1>Planning</h1><p>We help accountants file taxes. Our fees for homeowners vary by state.</p></main>`, "/services/advice");
    const buyers = marketTextCandidates(p, observations).filter((c) => c.field.endsWith("/target_buyers"))
      .flatMap((c) => c.value as { text: string }[]).map((v) => v.text);
    expect(buyers).not.toContain("homeowners");
    const own = page(`<main><h1>Planning</h1><p>We help small businesses with 1 to 10 employees reduce costs.</p></main>`, "/services/advice");
    const ownBuyers = marketTextCandidates(own.p, own.observations).filter((c) => c.field.endsWith("/target_buyers"))
      .flatMap((c) => c.value as { text: string }[]).map((v) => v.text);
    expect(ownBuyers).toContain("small businesses with 1 to 10 employees");
  });

  it("does not classify negated service sentences as provider roles", () => {
    expect(isExplicitServiceProviderSentence("We provide no accounting services.")).toBe(false);
    expect(isExplicitServiceProviderSentence("We provide services without legal advice.")).toBe(false);
    expect(isExplicitServiceProviderSentence("We don't provide tax services.")).toBe(false);
    expect(isExplicitServiceProviderSentence("We provide accounting services.")).toBe(true);
  });

  it("drops partner social links but keeps the company's own", () => {
    const { p, observations } = page(`<footer><a href="https://www.facebook.com/exampleco">Facebook</a></footer>
      <main><h2>Our partners</h2><a href="https://www.facebook.com/partner-corp">Partner Corp on Facebook</a></main>`, "/");
    const profiles = deterministicCandidates(p, observations).filter((c) => c.field === "/online_presence/social_media_links")
      .flatMap((c) => c.value as { profile_url: string }[]).map((s) => s.profile_url);
    expect(profiles).toEqual(["https://www.facebook.com/exampleco"]);
  });
});
