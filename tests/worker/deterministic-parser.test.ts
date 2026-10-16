import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";

const companyId = "11111111-1111-4111-8111-111111111111";
function extract(body: string, path = "/") {
  const url = "https://example.com" + path;
  const page = { id: "33333333-3333-4333-8333-333333333333",
    retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  const observations = technicalObservations(page);
  const candidates = deterministicCandidates(page, observations);
  const validated = validateCandidates(candidates, page, observations, companyId);
  return { candidates, validated, page, observations };
}
const metadata = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe("source-only deterministic parsing", () => {
  it("maps declared organization metadata and preserves competing addresses without completing missing parts", () => {
    const html = metadata({ "@graph": [{ "@type": "Organization", url: "https://example.com/",
      description: "Repairs for local workshops.", alternateName: ["Workshop Works"],
      areaServed: { "@type": "Place", name: "West County" },
      address: [{ streetAddress: "10 Elm Street", addressLocality: "Oakville" },
        { streetAddress: "20 Elm Street", addressLocality: "Oakville" }] },
    { "@type": "Organization", url: "https://external.example/", description: "External vendor." }] });
    const { candidates } = extract(html);
    expect(candidates.filter((c) => c.field.endsWith("/overview")).map((c) => c.value))
      .toEqual(["Repairs for local workshops."]);
    expect(candidates.filter((c) => c.field.endsWith("/main_address")).map((c) => c.value))
      .toEqual([expect.objectContaining({ line1: "10 Elm Street", country: null, postal_code: null }),
        expect.objectContaining({ line1: "20 Elm Street", country: null, postal_code: null })]);
    expect(candidates.find((c) => c.field.endsWith("/service_locations"))?.value).toEqual([{ text: "West County" }]);
    expect(candidates.every((c) => c.origin === "source_backed" && c.supporting_fields.length === 0)).toBe(true);
  });

  it("maps organization founders and offered products with exact metadata evidence and stable identities", () => {
    const html = metadata({ "@type": "Organization", url: "https://example.com/", founder: {
      "@type": "Person", name: "Alex Rowan", jobTitle: "Founder", description: "Alex repairs workshop equipment.",
    }, makesOffer: { "@type": "Product", name: "Repair Kit", description: "Tools for small repairs.",
      category: "Tools", offers: { "@type": "Offer", price: "12.50", priceCurrency: "EUR" } } });
    const first = extract(html);
    const second = extract(html);
    expect(first.validated.map((c) => c.id)).toEqual(second.validated.map((c) => c.id));
    expect(first.candidates.find((c) => c.field === "/key_people/@id/title")?.value).toBe("Founder");
    expect(first.candidates.some((c) => c.field.endsWith("/gender"))).toBe(false);
    const price = first.candidates.find((c) => c.field.endsWith("/pricing"))!;
    expect(price.value).toMatchObject({ raw: "12.50", amount: "12.50", currency: "EUR", billing_interval: null });
    expect(price.segment_ids).toEqual([]);
    expect(first.observations.filter((o) => price.observation_ids.includes(o.id)).map((o) => o.value))
      .toEqual(expect.arrayContaining(["Repair Kit", "Product", "12.50", "EUR"]));
  });

  it("uses explicit labels and homepage overview metadata while leaving unlabeled interpretations absent", () => {
    const { candidates } = extract(`<meta name="description" content="A local repair company.">
      <main><p>Industry: Equipment repair</p><p>Business model: Repairs by appointment</p>
      <p>Company pitch: Tools working again.</p><p>Target buyers: Local workshops</p>
      <p>Established in 2018.</p><p>Since 2024, our team has worked in a new office.</p>
      <p>Our team looks young and includes about 25 people.</p><p>We care about customers.</p></main>`);
    expect(candidates.find((c) => c.field.endsWith("/industry"))?.value).toBe("Equipment repair");
    expect(candidates.find((c) => c.field.endsWith("/company_pitch"))?.value).toBe("Tools working again.");
    expect(candidates.filter((c) => c.field.endsWith("/year_founded")).map((c) => c.value)).toEqual([2018]);
    expect(candidates.some((c) => /employee_count|gender|writing_style|founding_story/.test(c.field))).toBe(false);
    expect(extract('<meta name="description" content="This page discusses repairs.">', "/articles/repair")
      .candidates.some((c) => c.field.endsWith("/overview"))).toBe(false);
  });

  it("preserves labeled employee ranges and approximation without inventing exact counts", () => {
    const { candidates } = extract('<p>Employee count: 25–50 people.</p><p>Employee count: about 30 employees</p>');
    expect(candidates.filter((c) => c.field.endsWith("/employee_count")).map((c) => c.value))
      .toEqual([{ raw: "25–50 people.", exact: null, min: 25, max: 50, as_of: null },
        { raw: "about 30 employees", exact: null, min: null, max: null, as_of: null }]);
  });

  it("extracts declared service cards and service anchors without classifying unrelated page headings", () => {
    const { candidates } = extract(`<main><section><h2>Our Services</h2><article><h3>Equipment Repair</h3>
      <p>Repairs for workshop machines.</p><a href="/services/equipment-repair">Equipment Repair</a></article></section>
      <section><h2>Latest Articles</h2><article><h3>Repair advice</h3><p>Read the guide.</p></article></section>
      <a href="/articles/tools">Tool advice</a><a href="/services/contact">Contact</a></main>`);
    expect(candidates.filter((c) => c.field === "/offerings/@id/name").map((c) => c.value))
      .toEqual(["Equipment Repair", "Equipment Repair"]);
    expect(candidates.find((c) => c.field === "/offerings/@id/description")?.value)
      .toBe("Repairs for workshop machines.");
    const detail = extract('<meta name="description" content="Equipment repair by appointment."><a href="/services/equipment-repair">Equipment Repair</a>', "/services/equipment-repair");
    expect(detail.candidates.find((c) => c.field === "/offerings/@id/description")?.value)
      .toBe("Equipment repair by appointment.");
  });

  it("aligns one declared service with its corroborated visible self-link without merging a service catalog", () => {
    const detail = '<h2>Equipment Repair</h2><a href="/services/equipment-repair">Equipment Repair</a>';
    const schema = { "@type": "Service", name: "Equipment Repair Services", url: "https://example.com/old-repair-page",
      description: "Repairs for workshop machines." };
    const { candidates, validated } = extract(metadata(schema) + detail, "/services/equipment-repair");
    const offerings = validated.filter((c) => c.field.startsWith("/offerings"));
    expect(new Set(offerings.map((c) => c.entryId)).size).toBe(1);
    expect(candidates.filter((c) => c.field === "/offerings/@id/name").map((c) => c.value))
      .toEqual(["Equipment Repair Services", "Equipment Repair"]);
    expect(candidates.filter((c) => c.field === "/offerings/@id/url").map((c) => c.value))
      .toEqual(["https://example.com/services/equipment-repair", "https://example.com/services/equipment-repair"]);
    const catalog = extract(metadata([schema, { "@type": "Service", name: "Calibration" }]) + detail,
      "/services/equipment-repair");
    const structured = catalog.candidates.filter((c) => c.field === "/offerings/@id/name" && c.observation_ids
      .some((id) => catalog.observations.find((o) => o.id === id)?.property?.startsWith("jsonld:")));
    expect(structured.every((c) => c.entity_key?.includes("|jsonld:"))).toBe(true);
    expect(new Set(structured.map((c) => c.entity_key)).size).toBe(2);
  });

  it("requires agreement between a named profile title and visible heading before copying a person's explicit role", () => {
    const title = '<title>Alex Rowan — Workshop Works Founder</title>';
    const { candidates } = extract(title + '<main><h1>Alex Rowan, CPA</h1><p>Alex repairs tools.</p></main>', "/about-us/alex-rowan");
    expect(candidates.filter((c) => c.field.startsWith("/key_people")).map((c) => c.value))
      .toEqual(["Alex Rowan", "Founder"]);
    expect(extract(title + '<h1>Our company</h1>', "/about-us/alex-rowan").candidates
      .some((c) => c.field.startsWith("/key_people"))).toBe(false);
    expect(extract(title + '<h1>Alex Rowan</h1>', "/articles/alex-rowan").candidates
      .some((c) => c.field.startsWith("/key_people"))).toBe(false);
  });
});
