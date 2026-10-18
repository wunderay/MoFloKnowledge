import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { buyerIdentityKey, marketTextCandidates, MARKET_TEXT_SUPPORTED_FIELDS } from "../../src/worker/extract/market-text";
import { technicalObservations } from "../../src/worker/extract/observations";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";

function extract(body: string, path = "/services/advice") {
  const url = "https://example.com" + path;
  const page = { id: "33333333-3333-4333-8333-333333333333", retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }) };
  const observations = technicalObservations(page);
  const candidates = marketTextCandidates(page, observations);
  const validated = validateCandidates(candidates, page, observations, "11111111-1111-4111-8111-111111111111");
  const values = (field: string) => candidates.filter((candidate) => candidate.field.endsWith("/" + field))
    .flatMap((candidate) => candidate.value as unknown[]);
  return { page, observations, candidates, validated, values };
}

describe("literal market and conversion extraction", () => {
  it("extracts declared buyers, exact needs, unnamed personas and client industry lists", () => {
    const passage = "For small businesses with 1 to 10 employees, we provide planning to help you reduce your costs.";
    const pain = "Preparing your own documents can be extremely difficult with today's complex rules.";
    const { values, candidates, validated } = extract(`<main><h1>Planning services</h1><p>${passage}</p>
      <p>${pain}</p><p>I've worked with a wide variety of businesses, including: medical practices, law firms, real estate brokers, property management, internet sales, construction, restaurants, service industry, and homeowners and condo associations.</p></main>`);
    expect(values("target_buyers")).toContainEqual({ text: "small businesses with 1 to 10 employees" });
    expect(values("customer_needs")).toEqual(expect.arrayContaining([{ text: passage }, { text: pain }]));
    expect(values("ideal_customer_personas")).toContainEqual({ name: null, role: null,
      organization_type: "small businesses with 1 to 10 employees", goals: [{ text: passage }], pain_points: [] });
    expect(values("industry_groupings")).toHaveLength(9);
    expect(values("industry_groupings")).toContainEqual({ text: "homeowners and condo associations" });
    expect(candidates.every((candidate) => candidate.segment_ids.length > 0 && candidate.origin === "source_backed")).toBe(true);
    expect(candidates.some((candidate) => candidate.field.endsWith("/employee_count"))).toBe(false);
    expect(validated).toHaveLength(candidates.length);
    const merged = extract("<p>For small businesses, we provide planning to reduce your costs.</p><p>For small business, we provide support to save your time.</p>");
    expect(merged.values("ideal_customer_personas")).toEqual([{ name: null, role: null,
      organization_type: "small businesses", goals: [
        { text: "For small businesses, we provide planning to reduce your costs." },
        { text: "For small business, we provide support to save your time." },
      ], pain_points: [] }]);
    expect(merged.candidates.find((candidate) => candidate.field.endsWith("/ideal_customer_personas"))?.segment_ids).toHaveLength(2);
    expect(buyerIdentityKey("small businesses")).toBe(buyerIdentityKey("Small business"));
    expect(buyerIdentityKey("small businesses")).not.toBe(buyerIdentityKey("smaller companies"));
  });

  it("retains explicit broad audiences and qualified client lifecycle without promoting client headcount", () => {
    const scope = "We specialize in planning for individuals and businesses, ensuring our clients manage complex filings.";
    const lifecycle = "We cater to clients, from brand-new businesses to those nearing retirement, typically small businesses with 1 to 10 employees.";
    const { values, candidates } = extract(`<p>${scope}</p><p>${lifecycle}</p>
      <p>Your top-rated partner helps you relax!</p><p>Contact our office today to save your time.</p>
      <p>It is important that you understand these regulations to avoid problems.</p>`);
    expect(values("target_buyers")).toEqual(expect.arrayContaining([{ text: "individuals" }, { text: "businesses" },
      { text: "small businesses with 1 to 10 employees" }]));
    expect(values("ideal_customer_personas")).toContainEqual(expect.objectContaining({ organization_type:
      "brand-new businesses to those nearing retirement, typically small businesses with 1 to 10 employees", name: null, role: null }));
    expect(values("customer_needs")).toEqual([{ text: scope }]);
    expect(candidates.some((candidate) => candidate.field.endsWith("/employee_count"))).toBe(false);
  });

  it("does not read a tax schedule or a fee schedule as an appointment funnel", () => {
    expect(extract("<main><h2>Schedule K-1 Preparation</h2><p>We prepare partnership returns.</p></main>", "/services/tax").values("funnels")).toEqual([]);
    expect(extract("<main><h1>Fee schedule</h1><p>Our rates.</p></main>", "/fee-schedule").values("funnels")).toEqual([]);
    expect(extract("<main><h1>Appointments</h1><p>Pick a time.</p></main>", "/schedule").values("funnels"))
      .toEqual([{ name: "Appointment scheduler", steps: [] }]);
  });

  it("copies observed CTAs and channels and names a funnel only from an explicit message field", () => {
    const { values, page, observations } = extract(`<main><a href="/appointment">Schedule Appointment</a><a href="/contact">Get started</a><a href="/contact">Contact</a>
      <a href="/privacy">Privacy Policy</a><button>Open menu</button><button>2</button>
      <form action="/inquiries"><label>Email</label><label>Message</label><button type="submit">Submit</button></form></main>`);
    expect(values("ctas")).toEqual(expect.arrayContaining([
      { label: "Schedule Appointment", url: "https://example.com/appointment", purpose: null },
      { label: "Submit", url: null, purpose: null },
    ]));
    expect(values("ctas").map((value) => (value as { label: string }).label))
      .not.toEqual(expect.arrayContaining(["Open menu", "Privacy Policy", "2"]));
    expect(values("channels")).toEqual([]);
    // Only the form's explicit Message field names a funnel; the links and the other inputs add none.
    expect(values("funnels")).toEqual([{ name: "Contact form", steps: [] }]);
    expect(MARKET_TEXT_SUPPORTED_FIELDS).toContain("/market_and_customers/funnels");
    // A capture can expose its own form submit without a separate page-level CTA observation.
    page.capture.observations.forms = [{ action: "https://example.com/inquiries", submitLabels: ["Send request\n\nSending..."] }];
    observations.push({ id: "form-submit", selector: "form", property: "form-submit-label",
      value: "Send request\n\nSending...", asset_url: "https://example.com/inquiries" });
    const explicitSubmit = marketTextCandidates(page, observations);
    expect(explicitSubmit.find((candidate) => candidate.observation_ids.includes("form-submit"))?.value)
      .toEqual([{ label: "Send request", url: "https://example.com/inquiries", purpose: null }]);
    expect(explicitSubmit.some((candidate) => candidate.field.endsWith("/funnels"))).toBe(false);
    expect(explicitSubmit.some((candidate) => JSON.stringify(candidate.value).includes("Sending..."))).toBe(false);
    const context = "Get weekly articles in your inbox with practical planning updates.";
    const notification = extract(`<p>${context}</p><form><label>Email address</label><button>Notify me</button></form>`);
    notification.page.capture.observations.forms = [{ action: null, context, submitLabels: ["Notify me"] }];
    const notificationCandidates = marketTextCandidates(notification.page, notification.observations);
    const channel = notificationCandidates.find((candidate) => candidate.field.endsWith("/channels"));
    expect(channel?.value).toEqual([{ channel_type: "Newsletter", label: "Email newsletter", url: notification.page.capture.finalUrl }]);
    expect(channel?.note).toMatch(/^Observed form location/);
    expect(channel?.segment_ids.length).toBeGreaterThan(0);
    validateCandidates(notificationCandidates, notification.page, notification.observations, "11111111-1111-4111-8111-111111111111");
  });

  it("requires an explicit supplier relationship rather than a resource host or software mention", () => {
    const { values } = extract(`<main><p>Our partners include Bolt Labs, Beacon Works, Box.com.</p>
      <p>We use LedgerPad. Images load from StorageCloud. Analytics uses MeasureIt.</p>
      <a href="https://tracker.example/pixel">MeasureIt</a></main>`);
    expect(values("suppliers_and_partners")).toEqual([
      { name: "Bolt Labs", relationship_type: "partners", relationship_text: "Our partners include Bolt Labs, Beacon Works, Box.com.", url: null },
      { name: "Beacon Works", relationship_type: "partners", relationship_text: "Our partners include Bolt Labs, Beacon Works, Box.com.", url: null },
      { name: "Box.com", relationship_type: "partners", relationship_text: "Our partners include Bolt Labs, Beacon Works, Box.com.", url: null },
    ]);
  });

  it("leaves article advice, negated audiences and unrelated text unclassified", () => {
    const article = extract("<p>We help small businesses reduce your costs and avoid difficult paperwork.</p>", "/blog/advice");
    expect(article.candidates).toEqual([]);
    const unrelated = extract("<p>We do not serve large corporations.</p><p>Our team has 1 to 10 employees.</p><p>A company can face difficult problems.</p>");
    expect(unrelated.values("target_buyers")).toEqual([]);
    expect(unrelated.values("customer_needs")).toEqual([]);
    expect(unrelated.values("suppliers_and_partners")).toEqual([]);
    const generic = extract("<p>We serve growing businesses.</p><p>We can help you with the following problems:</p><p>The agency will not be looking to save you money.</p><p>We have deep understanding and improve efficiency for numerous businesses.</p><p>Our employees train to improve your experience.</p>");
    expect(generic.values("ideal_customer_personas")).toEqual([]);
    expect(generic.values("customer_needs")).toEqual([]);
    const educational = "Settlement options - Qualifying for a settlement can save you money on penalties and interest.";
    const problem = "Preparing your own filings can be extremely difficult with complex rules.";
    const declaredNeed = "You need clear guidance to reduce your filing mistakes.";
    const scoped = extract(`<h2>Services</h2><p>${problem}</p><ul><li>${educational}</li></ul>
      <h2>Customer needs</h2><ul><li>${declaredNeed}</li></ul>`);
    expect(scoped.values("customer_needs")).toEqual(expect.arrayContaining([{ text: problem }, { text: declaredNeed }]));
    expect(scoped.values("customer_needs")).not.toContainEqual({ text: educational });
    expect(scoped.page.capture.segments.some((segment) => segment.text.includes(educational))).toBe(true);
  });
});
