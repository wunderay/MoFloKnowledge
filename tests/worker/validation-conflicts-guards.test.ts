import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import type { StoredCapture } from "../../src/worker/crawl/run-crawl";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import { reduceCandidates } from "../../src/worker/extract/reduce";

const companyId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const options = { companyId, jobId, partial: false };

function offeringNames(path: string, body: string) {
  const url = "https://northwind.example.com" + path;
  const page: StoredCapture = {
    id: "33333333-3333-4333-8333-333333333333",
    retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }),
  };
  const observations = technicalObservations(page);
  const validated = validateCandidates(deterministicCandidates(page, observations), page, observations, companyId);
  return reduceCandidates(validated, options).filter((p) => p.kind === "offering")
    .map((p) => (p.content as unknown as { name: string }).name);
}

describe("offering name chrome guard", () => {
  it("keeps a real offering whose name starts with Skip", () => {
    expect(offeringNames("/services/skip-tracing/", `<html><head><title>Skip Tracing</title></head>
      <body><main><h1>Skip Tracing</h1><p>We locate people for collections.</p></main></body></html>`))
      .toEqual(["Skip Tracing"]);
  });

  it("drops Skip to content as an offering name", () => {
    expect(offeringNames("/services/skip-to-content/", `<html><head><title>Skip to content</title></head>
      <body><main><h1>Skip to content</h1><p>Jump to the main part of the page.</p></main></body></html>`))
      .not.toContain("Skip to content");
  });
});
