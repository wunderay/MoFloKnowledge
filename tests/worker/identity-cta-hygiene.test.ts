import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import { reduceCandidates } from "../../src/worker/extract/reduce";

const companyId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";

function extract(body: string, path = "/") {
  const url = "https://acme-group.example.com" + path;
  const page = { id: "33333333-3333-4333-8333-333333333333", retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  const observations = technicalObservations(page);
  const candidates = deterministicCandidates(page, observations);
  const validated = validateCandidates(candidates, page, observations, companyId);
  const values = (field: string) => validated.filter((candidate) => candidate.field === field)
    .flatMap((candidate) => candidate.value as unknown[]);
  return { page, observations, candidates, validated, values };
}

describe("identity and call-to-action hygiene", () => {
  it("names the brand from the title segment that the footer repeats, not from a person's site name", () => {
    const { values } = extract(`<html><head>
        <title>Acme Group | Springfield Experts</title>
        <meta property="og:site_name" content="Jane Doe Springfield Luxury Agent">
      </head><body>
        <header><img src="/logo.png" alt="Acme Group logo"></header>
        <main><h1>Springfield Experts</h1><p>Local property guidance for families.</p></main>
        <footer><p>Acme Group</p></footer>
      </body></html>`);
    const names = (values("/company_foundation/alternative_company_names") as { text: string }[]).map((name) => name.text);
    expect(names).toEqual(["Acme Group"]);
  });

  it("keeps each visible call-to-action label, including text nested inside a link's child elements", () => {
    const { values } = extract(`<main><h1>Listings</h1>
        <a href="/listings"><span class="icon" aria-hidden="true"></span><span>View Listings</span></a>
        <a href="/bios/jane"><span>Read Bio</span></a></main>`);
    const ctas = values("/market_and_customers/ctas") as { label: string; url: string | null; purpose: string | null }[];
    expect(ctas.find((cta) => cta.label === "View Listings")).toMatchObject({ url: "https://acme-group.example.com/listings", purpose: null });
    expect(ctas.map((cta) => cta.label)).toContain("Read Bio");
  });

  it("dedupes an e-mail address case-insensitively", () => {
    const { validated } = extract(`<main><h1>Contact</h1>
        <a href="mailto:Info@acme-group.example.com">Info@acme-group.example.com</a>
        <a href="mailto:info@acme-group.example.com">Email the team</a></main>`, "/contact");
    const proposals = reduceCandidates(validated, { companyId, jobId, partial: false });
    const channels = (proposals.find((proposal) => proposal.kind === "market_and_customers")?.content as
      { channels: { channel_type: string; label: string }[] }).channels
      .filter((channel) => channel.channel_type === "Email");
    expect(channels).toHaveLength(1);
    expect(channels[0].label.toLowerCase()).toBe("info@acme-group.example.com");
  });

  it("takes the industry and role from a home heading without praise words or a service-area place name", () => {
    const { values } = extract(`<main><h1>Springfield's Premier Plumbing Team</h1>
        <p>Call for same-day repairs and new installations.</p><p>We serve Springfield.</p></main>`);
    expect(values("/company_foundation/industry")).toEqual(["Plumbing"]);
    const roles = (values("/company_foundation/company_role") as { text: string }[]).map((role) => role.text);
    expect(roles).toEqual(["Plumbing Team"]);
  });
});
