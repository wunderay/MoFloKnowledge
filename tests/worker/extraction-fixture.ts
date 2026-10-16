import { captureHtml } from "../../src/worker/capture/html";
import type { StoredCapture } from "../../src/worker/crawl/run-crawl";
import type { FieldCandidate } from "../../src/worker/extract/types";
export const companyId = "11111111-1111-4111-8111-111111111111";
export const jobId = "22222222-2222-4222-8222-222222222222";
export const page: StoredCapture = {
  id: "33333333-3333-4333-8333-333333333333",
  retrievedAt: "2026-10-16T00:00:00Z",
  capture: captureHtml({
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    body: `<html><head><title>Northstar</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Northstar","description":"Northstar builds water monitoring equipment for community water teams.","employee":{"@type":"Person","name":"Jamie Park","jobTitle":"Founder"},"address":[{"@type":"PostalAddress","streetAddress":"400 River Street","addressLocality":"Portland"},{"@type":"PostalAddress","streetAddress":"401 River Street","addressLocality":"Portland"}]}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Field Kit","description":"Monitoring equipment.","url":"https://example.com/kit","offers":{"@type":"Offer","price":"1200","priceCurrency":"USD"}}</script></head><body><main><p>Northstar builds water monitoring equipment for community water teams.</p><p>Industry: water monitoring equipment</p><p>Company pitch: Practical water tools for community teams.</p><p>Target buyers: community water teams</p><p>Founded in 2012, we manufacture equipment and sell subscriptions.</p><p>Employee count: 25–50 people</p><p>We serve the Pacific Northwest.</p><p>Our address is 400 River Street, Portland.</p><p>Our address is 401 River Street, Portland.</p><p>Jamie Park, Founder. Jamie leads product engineering.</p><p>Field Kit. Monitoring equipment. USD 1200 per kit.</p><a href="https://example.com/team/jamie">Jamie Park</a><a href="https://example.com/kit">See Field Kit</a><a href="https://linkedin.com/company/northstar">LinkedIn</a></main></body></html>`,
  }),
};
page.capture.observations.design = {
  finalUrl: page.capture.finalUrl,
  text: page.capture.text,
  styles: [
    {
      selector: "body",
      evidenceId: "body-font",
      fontFamily: "Inter, sans-serif",
      fontSize: "16px",
      fontWeight: "400",
      color: "rgb(20, 30, 40)",
      backgroundColor: "rgb(255, 255, 255)",
    },
  ],
  stylesheets: [
    {
      url: "https://example.com/style.css",
      declarations:
        "@font-face { font-family: Inter; src: url('/inter.woff2'); } body { font-family: Inter, sans-serif; }",
      status: "available",
    },
  ],
  fonts: [{ url: "https://example.com/inter.woff2", loaded: true }],
  logos: [
    {
      url: "https://example.com/logo.png",
      alt: "Northstar",
      context: "header",
    },
  ],
  limitations: [],
  resourceBytes: 1200,
};
export function candidate(
  field: string,
  value: unknown,
  quote: string,
  entity_key: string | null = null,
  extra: Partial<FieldCandidate> = {},
): FieldCandidate {
  const segment = page.capture.segments.find((s) => s.text.includes(quote));
  if (!segment) throw new Error("Fixture quote missing: " + quote);
  return {
    field,
    value,
    entity_key,
    origin: "source_backed",
    segment_ids: [segment.id],
    observation_ids: [],
    supporting_fields: [],
    note: null,
    ...extra,
  };
}
