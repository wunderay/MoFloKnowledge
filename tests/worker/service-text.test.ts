import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { serviceTextCandidates } from "../../src/worker/extract/services-text";
import { structuredCandidates } from "../../src/worker/extract/structured";

function extract(body: string, path: string) {
  const url = "https://example.com" + path;
  const page = { id: "33333333-3333-4333-8333-333333333333", retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  const observations = technicalObservations(page);
  const candidates = [...structuredCandidates(page, observations), ...serviceTextCandidates(page, observations)];
  return { page, observations, candidates };
}
const values = (candidates: ReturnType<typeof extract>["candidates"], field: string) =>
  candidates.filter((candidate) => candidate.field === "/offerings/@id/" + field);

describe("authored service content", () => {
  it("keeps one repair identity across menu aliases, schema and detail copy, including all capabilities", () => {
    const body = `<meta name="description" content="A short teaser.">
      <script type="application/ld+json">{"@type":"Service","name":"Pump and Valve Repair Services","url":"https://example.com/pump-valve-repair","description":"Repair services."}</script>
      <nav><a href="/services/pump-valve-repair">Industrial Services</a></nav>
      <main><h1>Pump &amp; Valve Repair</h1><p>We repair pumps and valves for local factories.</p>
      <p>Our technicians inspect seals before returning equipment.</p>
      <h2>Included support</h2><p>We provide an inspection report with every repair.</p>
      <ul><li>We provide:</li><li>Seal replacement</li><li>Pressure testing</li></ul></main>`;
    const { candidates } = extract(body, "/services/pump-valve-repair");
    expect(new Set(candidates.map((candidate) => candidate.entity_key))).toEqual(new Set(["https://example.com/services/pump-valve-repair"]));
    const names = values(candidates, "name");
    expect(names.find((candidate) => candidate.value === "Pump & Valve Repair")).toMatchObject({ priority: 95 });
    expect(names.find((candidate) => candidate.value === "Industrial Services")).toMatchObject({ priority: 30 });
    expect(values(candidates, "description").find((candidate) => (candidate as { priority?: number }).priority === 95)?.value)
      .toBe("We repair pumps and valves for local factories.\n\nOur technicians inspect seals before returning equipment.");
    expect(values(candidates, "features").map((candidate) => candidate.value)).toEqual(expect.arrayContaining([
      [{ text: "Seal replacement" }], [{ text: "Pressure testing" }], [{ text: "We provide an inspection report with every repair." }],
    ]));
    expect(values(candidates, "pricing")).toEqual([]);
    expect(values(candidates, "features").some((candidate) => JSON.stringify(candidate.value).includes("We provide:"))).toBe(false);
  });

  it("copies catalog categories from their actual sections and gives unlinked cards stable names", () => {
    const card = (name: string) => `<article><h3>${name}</h3><p>We provide practical instruction.</p></article>`;
    const body = (reverse = false) => `<main><section><h2>Our Services</h2>${(reverse ? ["Report Workshops", "Database Training"] : ["Database Training", "Report Workshops"]).map(card).join("")}</section>
      <h2>Technology Consulting</h2><a href="/services/database-training">Database Training</a>
      <h2>Welcome To Training Services, Inc.</h2><a href="/services/report-workshops">Report Workshops</a>
      <section><h2>Latest Articles</h2><h3>Training trends</h3><p>We discuss trends in education.</p></section></main>`;
    const first = extract(body(), "/services"), second = extract(body(true), "/services");
    expect(values(first.candidates, "category").map((candidate) => candidate.value)).toEqual(["Technology Consulting"]);
    const unlinked = (candidates: typeof first.candidates) => values(candidates, "name")
      .filter((candidate) => candidate.entity_key?.includes("|service:")).map((candidate) => candidate.entity_key).sort();
    expect(unlinked(first.candidates)).toEqual(unlinked(second.candidates));
    expect(values(first.candidates, "name").some((candidate) => candidate.value === "Training trends")).toBe(false);
  });

  it("retains the held-out tax subservice and interim-support declarations without adding absent trust/prices", () => {
    const { candidates } = extract(`<nav><a href="/services/tax-preparation-planning">Tax Services</a></nav><main>
      <h2>Tax Preparation &amp; Planning</h2><p>Preparing your own tax return can be extremely difficult with today's complex tax code and may often leave you with more questions than answers.</p>
      <h3>Tax Preparation in Florida</h3><p>Our tax preparation services include:</p><ul>
      <li>Individual Tax Preparation</li><li>Gift &amp; Estate Tax Return Preparation</li><li>Estate and Succession Planning</li><li>Business Start-Ups</li></ul>
      <h3>Tax Planning &amp; Education</h3><p>We offer tax and education planning to assist start-ups, as well as, established businesses. We will provide you with a complete list of the most commonly overlooked deductions so that you can limit your tax liability for the following year.</p>
      <h3>Tax Resources</h3><p>Here are some links to help you learn more about taxes:</p></main>`, "/services/tax-preparation-planning");
    expect(values(candidates, "name").map((candidate) => candidate.value)).toEqual([
      "Tax Services", "Tax Preparation & Planning",
    ]);
    expect(values(candidates, "description").some((candidate) => String(candidate.value).includes("Here are some links"))).toBe(false);
    expect(values(candidates, "features").filter((candidate) => candidate.entity_key?.endsWith("|service:gift and estate tax return preparation"))).toEqual([]);
    expect(values(candidates, "features").filter((candidate) => candidate.entity_key === "https://example.com/services/tax-preparation-planning")
      .map((candidate) => candidate.value)).toContainEqual([{ text: "Estate and Succession Planning" }]);
    expect(candidates.some((candidate) => String(candidate.value).includes('Trust'))).toBe(false);
    expect(values(candidates, "pricing")).toEqual([]);
    const bio = extract(`<main><h2>Independent CFO and Controller</h2><p>I provide part-time or interim financial and accounting services. You can receive the service and support of a highly qualified CFO and Controller only as you need it, without having to pay a full-time salary or benefits.</p>
      <p>I've worked with a wide variety of businesses, including: medical practices, law firms, construction, restaurants.</p></main>`, "/about-us/alex-rowan");
    expect(values(bio.candidates, "name").map((candidate) => candidate.value)).toEqual([]);
    expect(values(bio.candidates, "category")).toEqual([]);
    expect(values(bio.candidates, "pricing")).toEqual([]);
    expect(extract(`<main><h2>Consulting trends</h2><p>We offer part-time financial services.</p></main>`, "/blog/consulting").candidates).toEqual([]);
  });
});

it("keeps a company catalog's child scope separate from a linked service restriction", async () => {
  const { page, observations, candidates } = extract(`<nav>
    <a href="/services/tax-preparation-planning">Tax Preparation &amp; Planning</a>
    <a href="/services/payroll">Payroll</a></nav><main><h2>Our firm</h2>
    <p>Our services include the following:</p><ul><li>Estate, Gift &amp; Trust Returns</li><li>Personal Tax Returns</li></ul>
    <p>Payroll services are available only to existing tax clients.</p></main>`, "/firm-background");
  expect(values(candidates, "features").filter((candidate) => candidate.entity_key === "https://example.com/services/tax-preparation-planning")).toEqual([]);
  const trust = values(candidates, "name").find((candidate) => candidate.value === "Estate, Gift & Trust Returns")!;
  expect(values(candidates, "description").filter((candidate) => candidate.entity_key === trust.entity_key)).toEqual([]);
  expect(values(candidates, "features").filter((candidate) => candidate.entity_key === trust.entity_key)).toEqual([]);
  expect(values(candidates, "features").filter((candidate) => candidate.entity_key === "https://example.com/services/payroll").map((candidate) => candidate.value))
    .toEqual([[{ text: "Payroll services are available only to existing tax clients." }]]);
  const { validateCandidates } = await import("../../src/worker/extract/validate-candidates");
  expect(validateCandidates(candidates, page, observations, "11111111-1111-4111-8111-111111111111")).toHaveLength(candidates.length);
});

it("selects concise exact capability sentences while retaining the full original source passage", async () => {
  const original = "Pressure testing detects leaks. Results include measured pressure. Contact us for more information.";
  const { page, observations, candidates } = extract(`<main><h1>Pump Repair</h1>
    <p>We repair pumps for local factories. Our technicians inspect seals.</p><h2>Included support</h2><ul><li>${original}</li></ul></main>`, "/services/pump-repair");
  const feature = values(candidates, "features").find((candidate) => JSON.stringify(candidate.value).includes("Pressure testing"))!;
  expect(feature.value).toEqual([{ text: "Pressure testing detects leaks. Results include measured pressure." }]);
  const { validateCandidates } = await import("../../src/worker/extract/validate-candidates");
  const { reduceCandidates } = await import("../../src/worker/extract/reduce");
  const companyId = "11111111-1111-4111-8111-111111111111";
  const validated = validateCandidates(candidates, page, observations, companyId);
  const offering = reduceCandidates(validated, { companyId, jobId: "22222222-2222-4222-8222-222222222222", partial: false }).find((proposal) => proposal.kind === "offering")!;
  expect(offering.provenance.evidence.some((evidence) => evidence.excerpt === original)).toBe(true);
});
