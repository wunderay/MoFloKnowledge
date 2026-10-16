import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { companyTextCandidates } from "../../src/worker/extract/company-text";
import { fieldCandidateSchemas } from "../../src/worker/extract/candidate-schema";
import { FIELD_REGISTRY } from "../../src/contracts";

const metadata = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
function extract(body: string, sections: { heading: string; level: number; paragraphs: string[] }[], path = "/") {
  const url = "https://example.com" + path;
  const page = { id: "33333333-3333-4333-8333-333333333333", retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  page.capture.observations.contentSections = sections;
  const observations = technicalObservations(page);
  const candidates = companyTextCandidates(page, observations);
  for (const candidate of candidates) {
    const { priority, ...contract } = candidate as typeof candidate & { priority?: number };
    expect(priority).toBeGreaterThanOrEqual(0);
    fieldCandidateSchemas[FIELD_REGISTRY.findIndex((f) => f.path === candidate.field)].parse(contract);
    expect(candidate.segment_ids.every((id) => page.capture.segments.some((s) => s.id === id))).toBe(true);
  }
  return { candidates, page };
}

describe("extractive company and person passages", () => {
  it("extracts a design firm's actual business description, identity, promise, history, and geographic scope", () => {
    const intro = "Cedar Engineering LLC is an engineering consultancy. We design bridges for local authorities.";
    const history = "We started our own engineering practice in 2012 because rural communities needed safer crossings.";
    const scope = "We serve North County and East County.";
    const pitch = "Engineering better connections for your community!";
    const { candidates } = extract(metadata({ "@type": "Organization", url: "https://example.com/", name: "Cedar Engineering LLC" }) +
      `<main><h1>${pitch}</h1><p>${intro}</p><h2>Our Story</h2><p>${history}</p><p>${scope}</p></main>`, [
      { heading: pitch, level: 1, paragraphs: [intro] },
      { heading: "Our Story", level: 2, paragraphs: [history, scope] },
    ]);
    const value = (field: string) => candidates.find((c) => c.field.endsWith("/" + field))?.value;
    expect(value("overview")).toBe(intro);
    expect(value("business_model")).toBe(intro);
    expect(value("industry")).toBe("engineering consultancy");
    expect(value("company_role")).toEqual([{ text: "engineering consultancy" }]);
    expect(value("legal_entity_type")).toBe("LLC");
    expect(value("alternative_company_names")).toEqual([{ text: "Cedar Engineering LLC" }]);
    expect(value("year_founded")).toBe(2012);
    expect(value("founding_story")).toBe(history);
    expect(value("company_pitch")).toBe(pitch);
    expect(value("service_locations")).toEqual([{ text: "North County and East County" }]);
  });

  it("enriches a different firm's founder with exact biography paragraphs and current-practice founding evidence", () => {
    const experience = "My experience includes hospital work and, since 2011, my own medical practice in North Bay.";
    const qualification = "I am a board-certified physician with 18 years of clinical experience.";
    const practice = "I opened this clinic to provide care close to home.";
    const { candidates } = extract(`<title>Maya Patel — Blue Harbor Clinic Founder</title>` +
      `<main><h1>Maya Patel, MD</h1><h2>Founder and Medical Director</h2><p>${experience}</p><p>${practice}</p><p>${qualification}</p></main>`, [
      { heading: "Maya Patel, MD", level: 1, paragraphs: [] },
      { heading: "Founder and Medical Director", level: 2, paragraphs: [experience, practice, qualification] },
    ], "/about-us/maya-patel");
    expect(candidates.find((c) => c.field.endsWith("/year_founded"))?.value).toBe(2011);
    expect(candidates.find((c) => c.field.endsWith("/founding_story"))?.value).toBe(experience);
    expect(candidates.find((c) => c.field.endsWith("/background_or_relevance"))?.value)
      .toBe(experience + "\n\n" + qualification);
    expect(candidates.find((c) => c.field === "/key_people/@id/title")?.value).toBe("Founder and Medical Director");
    expect(candidates.some((c) => c.field.endsWith("/gender"))).toBe(false);
    expect(new Set(candidates.filter((c) => c.field.startsWith("/key_people")).map((c) => c.entity_key)).size).toBe(1);
  });

  it("rejects career dates, former practices, competitor identity, article promises and ambiguous own-practice dates", () => {
    const prose = ["We have worked in this industry since 1999 and moved offices in 2018.",
      "Our supplier is Other Studio LLC, founded in 1986.",
      "Since 2007, I have advised entrepreneurs in many countries.",
      "I started my own previous practice in 2006 before joining this firm."];
    const { candidates } = extract('<title>Welcome to Cedar Studio</title><main><h1>About Us</h1>' +
      prose.map((p) => `<p>${p}</p>`).join("") + '</main>', [{ heading: "About Us", level: 1, paragraphs: prose }], "/about");
    expect(candidates.some((c) => /year_founded|legal_entity_type|alternative_company_names|founding_story/.test(c.field))).toBe(false);
    expect(extract('<h1>Build a better business!</h1><p>We started our own company in 2017.</p>',
      [{ heading: "Build a better business!", level: 1, paragraphs: ["We started our own company in 2017."] }], "/articles/building").candidates).toEqual([]);
  });

  it("does not blend a site's legal identity with an external organization or duplicate structured people", () => {
    const biography = "My experience includes 20 years of manufacturing, and I am a certified production engineer.";
    const { candidates } = extract(metadata({ "@graph": [
      { "@type": "Organization", url: "https://external.example/", name: "External Works LLC" },
      { "@type": "Organization", url: "https://example.com/", name: "Cedar Studio", founder: {
        "@type": "Person", name: "Alex Rowan", jobTitle: "Founder" } },
    ] }) + `<title>Alex Rowan</title><h1>Alex Rowan</h1><h2>Founder</h2><p>${biography}</p>`, [
      { heading: "Alex Rowan", level: 1, paragraphs: [] },
      { heading: "Founder", level: 2, paragraphs: [biography] },
    ], "/team/alex-rowan");
    expect(candidates.some((c) => c.field.endsWith("/legal_entity_type"))).toBe(false);
    expect(candidates.find((c) => c.field.endsWith("/background_or_relevance"))?.entity_key)
      .toBe("https://example.com/team/alex-rowan|jsonld:0/@graph/1/founder");
  });
});
