import { captureHtml } from "../../src/worker/capture/html";
import type { StoredCapture } from "../../src/worker/crawl/run-crawl";
import type { FieldCandidate } from "../../src/worker/model/schema";
export const companyId = "11111111-1111-4111-8111-111111111111";
export const jobId = "22222222-2222-4222-8222-222222222222";
export const page: StoredCapture = {
  id: "33333333-3333-4333-8333-333333333333",
  retrievedAt: "2026-10-16T00:00:00Z",
  capture: captureHtml({
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    body: `<html><head><title>Northstar</title></head><body><main><p>Northstar builds water monitoring equipment for community water teams.</p><p>Founded in 2012, we manufacture equipment and sell subscriptions.</p><p>Our team includes 25–50 people.</p><p>We serve the Pacific Northwest.</p><p>Our address is 400 River Street, Portland.</p><p>Our address is 401 River Street, Portland.</p><p>Jamie Park, Founder. Jamie leads product engineering.</p><p>Field Kit. Monitoring equipment. USD 1200 per kit.</p><a href="https://example.com/team/jamie">Jamie Park</a><a href="https://example.com/kit">See Field Kit</a><a href="https://linkedin.com/company/northstar">LinkedIn</a></main></body></html>`,
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
// Recorded illustrative field candidates. They are fixture data, not live model qualification.
export function recordedCandidates(): FieldCandidate[] {
  return [
    candidate(
      "/company_foundation/overview",
      "Northstar builds water monitoring equipment for community water teams.",
      "Northstar builds",
    ),
    candidate(
      "/company_foundation/industry",
      "water monitoring equipment",
      "Northstar builds",
    ),
    candidate("/company_foundation/year_founded", 2012, "Founded in 2012"),
    candidate(
      "/company_foundation/employee_count",
      { raw: "25–50 people", exact: null, min: 25, max: 50, as_of: null },
      "25–50 people",
    ),
    candidate(
      "/company_foundation/service_locations",
      [{ text: "Pacific Northwest" }],
      "Pacific Northwest",
    ),
    ...["400", "401"].map((number) =>
      candidate(
        "/company_foundation/main_address",
        {
          label: null,
          raw: `${number} River Street, Portland`,
          line1: `${number} River Street`,
          line2: null,
          city: "Portland",
          region: null,
          postal_code: null,
          country: null,
        },
        `${number} River Street`,
      ),
    ),
    candidate(
      "/positioning/company_pitch",
      "Practical water tools for community teams.",
      "Northstar builds",
      null,
      {
        origin: "generated",
        supporting_fields: ["/company_foundation/overview"],
        note: "Suggested wording grounded in the overview.",
      },
    ),
    candidate(
      "/market_and_customers/target_buyers",
      [{ text: "community water teams" }],
      "community water teams",
    ),
    candidate(
      "/branding_and_style/writing_style_description",
      "Concise technical prose.",
      "Northstar builds",
      null,
      { origin: "inferred", note: "Interpretation of the sampled wording." },
    ),
    candidate(
      "/key_people/@id/name",
      "Jamie Park",
      "Jamie Park",
      "https://example.com/team/jamie",
    ),
    candidate(
      "/key_people/@id/title",
      "Founder",
      "Jamie Park",
      "https://example.com/team/jamie",
    ),
    candidate(
      "/offerings/@id/name",
      "Field Kit",
      "Field Kit. Monitoring",
      "https://example.com/kit",
    ),
    candidate(
      "/offerings/@id/description",
      "Monitoring equipment.",
      "Field Kit. Monitoring",
      "https://example.com/kit",
    ),
    candidate(
      "/offerings/@id/pricing",
      {
        kind: "paid",
        raw: "USD 1200 per kit",
        amount: "1200",
        min_amount: null,
        max_amount: null,
        currency: "USD",
        billing_interval: null,
        pricing_model: "per kit",
        qualifications: [],
        as_of: null,
      },
      "USD 1200",
      "https://example.com/kit",
    ),
    candidate(
      "/offerings/@id/url",
      "https://example.com/kit",
      "Field Kit. Monitoring",
      "https://example.com/kit",
    ),
  ];
}
