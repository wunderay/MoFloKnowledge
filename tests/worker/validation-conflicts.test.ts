import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import type { StoredCapture } from "../../src/worker/crawl/run-crawl";
import type { FieldCandidate } from "../../src/worker/extract/types";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { validateCandidates, type ValidatedCandidate } from "../../src/worker/extract/validate-candidates";
import { reduceCandidates } from "../../src/worker/extract/reduce";

const companyId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const options = { companyId, jobId, partial: false };
const host = "https://northwind.example.com";

function capturePage(path: string, body: string): StoredCapture {
  const url = host + path;
  return {
    id: "33333333-3333-4333-8333-333333333333",
    retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }),
  };
}

describe("validation and reducer conflicts on captured business pages", () => {
  it("accepts a legal suffix followed by a comma or space as the explicit legal entity", () => {
    const page = capturePage("/", `<html><head><title>Northwind, Inc. is based in Las Vegas</title></head>
      <body><main><p>Northwind, Inc. is based in Las Vegas and builds field sensors for utilities.</p></main></body></html>`);
    const observations = technicalObservations(page);
    const candidates = deterministicCandidates(page, observations);
    let validated: ValidatedCandidate[] = [];
    expect(() => {
      validated = validateCandidates(candidates, page, observations, companyId);
    }).not.toThrow();
    const legal = validated.filter((c) => c.field === "/company_foundation/legal_entity_type");
    expect(legal).toHaveLength(1);
    expect(legal[0].value).toMatch(/^Inc\.?$/);
    const foundation = reduceCandidates(validated, options).find((p) => p.kind === "company_foundation")!;
    expect(foundation.content).toMatchObject({ legal_entity_type: expect.stringMatching(/^Inc\.?$/) });
  });

  it("accepts a product detail page H1 as the offering name without service words in the page", () => {
    const page = capturePage("/products/acme-flex/", `<html><head><title>Acme Flex</title></head>
      <body><nav><a href="/products/">Products</a></nav><main><h1>Acme Flex</h1>
      <p>Acme Flex keeps field sensors calibrated between site visits.</p></main></body></html>`);
    const observations = technicalObservations(page);
    const candidates = deterministicCandidates(page, observations);
    let validated: ValidatedCandidate[] = [];
    expect(() => {
      validated = validateCandidates(candidates, page, observations, companyId);
    }).not.toThrow();
    const offering = reduceCandidates(validated, options).find((p) => p.kind === "offering")!;
    expect(offering).toBeDefined();
    expect(offering.content).toMatchObject({ name: "Acme Flex" });
    expect(offering.conflicts).toEqual([]);
  });

  it("keeps the full street address as main_address when a city and region are a strict subset of it", () => {
    const page = capturePage("/contact", `<html><head><title>Northwind</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Northwind","url":"https://northwind.example.com/","address":{"@type":"PostalAddress","addressLocality":"Springfield","addressRegion":"IL"}}</script>
      </head><body><main><h2>Contact</h2><address>12 Main St, Springfield IL 62701</address>
      <p>We build field sensors for utilities.</p></main></body></html>`);
    const observations = technicalObservations(page);
    const candidates = deterministicCandidates(page, observations);
    const validated = validateCandidates(candidates, page, observations, companyId);
    const foundation = reduceCandidates(validated, options).find((p) => p.kind === "company_foundation")!;
    expect(foundation.provenance.conflicts.filter((c) => c.target === "/company_foundation/main_address")).toEqual([]);
    expect(foundation.content).toMatchObject({
      main_address: expect.objectContaining({ raw: "12 Main St, Springfield IL 62701" }),
    });
  });

  it("reduces offering name values that share a first line to one name", () => {
    const page = capturePage("/", `<html><head><title>Northwind</title></head><body><main>
      <h2>Acme Flex</h2><p>A compact sensor</p>
      <a href="https://northwind.example.com/products/acme-flex/">Acme Flex</a></main></body></html>`);
    const observations = technicalObservations(page);
    const segment = (text: string) => {
      const found = page.capture.segments.find((s) => s.text === text);
      if (!found) {
        throw new Error("Fixture segment missing: " + text);
      }
      return found.id;
    };
    const entity = host + "/products/acme-flex/";
    const name = (value: string, segment_ids: string[]): FieldCandidate => ({
      field: "/offerings/@id/name", value, entity_key: entity, origin: "source_backed",
      segment_ids, observation_ids: [], supporting_fields: [], note: null,
    });
    const candidates = [
      name("Acme Flex", [segment("Acme Flex")]),
      name("Acme Flex\nA compact sensor", [segment("Acme Flex"), segment("A compact sensor")]),
    ];
    const validated = validateCandidates(candidates, page, observations, companyId);
    const offerings = reduceCandidates(validated, options).filter((p) => p.kind === "offering");
    expect(offerings).toHaveLength(1);
    expect(offerings[0].content).toMatchObject({ name: "Acme Flex" });
    expect(offerings[0].conflicts).toEqual([]);
  });
});
