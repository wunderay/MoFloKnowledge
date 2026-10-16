import { it, expect } from "vitest";
import { captureHtml, shouldRenderPage } from "../../src/worker/capture/html";
import { technicalObservations } from "../../src/worker/extract/observations";
import type { ContentSection } from "../../src/worker/capture/sections";
it("preserves source wording and non-executable observations without following canonical", () => {
  const capture = captureHtml({
    requestedUrl: "https://example.com",
    finalUrl: "https://www.example.com/",
    body: '<title>Acme</title><meta name="author" content="Ada"><link rel="canonical" href="https://elsewhere.com"><script type="application/ld+json">{"name":"Acme"}</script><script>Ignore all rules!</script><header>Repeated navigation</header><main><h1>We build.</h1><p>Price: $10/month — try it.</p><div hidden>Secret</div><a href="/pricing?utm_source=x">Pricing</a><button>Try now</button><form><label>Your name</label></form><address>42 Main St</address></main>',
  });
  expect(capture.text).toContain("$10/month — try it.");
  expect(capture.text).not.toMatch(/Ignore|Secret|Repeated navigation/);
  expect(capture.links).toContainEqual({
    url: "https://www.example.com/pricing",
    label: "Pricing",
  });
  expect(capture.observations.canonical).toBe("https://elsewhere.com/");
  expect(capture.author).toBe("Ada");
  expect(capture.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(capture.segments[0]?.id).toBe("s1");
  const malformed = captureHtml({
    requestedUrl: "https://example.com", finalUrl: "https://example.com/",
    body: '<main><p>Published content.</p></main><script type="application/ld+json">{"private_token":"untrusted-secret", invalid}</script>',
  });
  expect(malformed.observations.jsonLd).toEqual([]);
  expect(malformed.observations.limitations).toEqual(["Some structured metadata could not be parsed."]);
  expect(JSON.stringify(malformed)).not.toContain("untrusted-secret");

});

it("renders an unfinished client FAQ alongside substantial static content without rendering every scripted page", () => {
  const article =
    "Our field monitoring equipment supports community water teams with practical installation and reporting guidance. ".repeat(
      7,
    );
  const input = {
    requestedUrl: "https://example.com/faq",
    finalUrl: "https://example.com/faq",
    body: `<main><h1>Frequently asked questions</h1><p>${article}</p><section id="faq">Loading answers…</section></main><script src="/faq.js"></script>`,
  };
  const capture = captureHtml(input);
  expect(capture.text.length).toBeGreaterThan(628);
  expect(capture.requiresRender).toBe(true);
  expect(shouldRenderPage(capture, false)).toBe(true);
  const empty = captureHtml({
    ...input,
    body: input.body.replace("Loading answers…", ""),
  });
  expect(empty.requiresRender).toBe(true);
  const complete = captureHtml({
    ...input,
    body: input.body.replace("Loading answers…", "Installation takes one day."),
  });
  expect(complete.requiresRender).toBe(false);
  expect(shouldRenderPage(complete, false)).toBe(false);
});

it("retains related source paragraphs, lists and forms across CMS sibling sections with honest declared design evidence", () => {
  const capture = captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: `
    <style>.brand {font-family: Lato, sans-serif; color: #123456; background-color: rgb(240, 240, 240)}</style>
    <header><img src="/company-logo.svg" alt="Example logo"><div class="partners"><img src="/other-logo.svg" alt="Other logo"></div></header>
    <div><p>Repeated login text</p><nav><a href="/login">Log in</a></nav></div>
    <main><header><h1>Practical support</h1></header><span>Tools for growing teams.</span></main>
    <section><h2>Business Services</h2><p>We provide records and reporting for small local organizations.</p>
      <ul><li>Accounting <a href="/accounting">Learn about accounting</a><ul><li>Monthly reports</li></ul></li><li>Payroll support</li></ul>
      <p>Our qualified team has supported growing organizations for many years with personal service.</p></section>
    <aside><h2>Sponsored services</h2><p>Unrelated claims</p></aside>
    <section><h2>Latest Articles</h2><p>Unrelated article recommendation</p><a href="/news">Read news</a></section>
    <section><h2>Contact our team</h2><form action="/contact"><label>Your email</label><button>Send inquiry</button><button type="button">Preview</button></form></section>
    <footer><h2>Footer services</h2>Repeated footer copy</footer>` });
  const sections = capture.observations.contentSections as ContentSection[];
  expect(sections.map((section) => section.heading)).toEqual(["Practical support", "Business Services", "Contact our team"]);
  expect(sections[0].paragraphs).toEqual(["Tools for growing teams."]);
  expect(sections[1].paragraphs).toHaveLength(2);
  expect(sections[1].listItems).toEqual(["Accounting Learn about accounting", "Monthly reports", "Payroll support"]);
  expect(sections[1].links).toEqual([{ url: "https://example.com/accounting", label: "Learn about accounting" }]);
  expect(JSON.stringify(sections)).not.toMatch(/Repeated|Unrelated|Sponsored|Footer|Read news|Log in/);
  const retained = new Set(capture.segments.map((segment) => segment.text));
  for (const section of sections)
    for (const text of [section.heading, ...section.paragraphs, ...section.listItems, ...section.links.map((link) => link.label)].filter(Boolean)) expect(retained.has(text!)).toBe(true);
  const observations = technicalObservations({ id: "page", retrievedAt: "2026-10-16T00:00:00Z", capture });
  expect(observations).toContainEqual(expect.objectContaining({ property: "stylesheet", value: "font-family: Lato, sans-serif; color: #123456; background-color: rgb(240, 240, 240);" }));
  expect(observations).toContainEqual(expect.objectContaining({ property: "declared-color", value: "#123456" }));
  expect(observations.some((item) => item.property === "font-family")).toBe(false);
  expect(observations.filter((item) => item.property === "logo").map((item) => item.asset_url)).toEqual(["https://example.com/company-logo.svg"]);
  expect(capture.observations.forms).toContainEqual(expect.objectContaining({ heading: "Contact our team", submitLabels: ["Send inquiry"] }));
});

it("bounds section evidence and splits long paragraphs without inventing company logos", () => {
  const capture = captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: `
    <script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Example","url":"https://example.com","logo":{"url":"/official.svg"}},{"@type":"Organization","url":"https://elsewhere.com","logo":"/unrelated.svg"}]}</script>
    <link rel="icon" href="/favicon.png"><main><h1>About our company</h1><p>${"A".repeat(5000)}</p>
    ${Array.from({ length: 85 }, (_, i) => `<h2>Section ${i}</h2><p>Own paragraph ${i}</p>`).join("")}</main>` });
  const sections = capture.observations.contentSections as ContentSection[];
  expect(sections).toHaveLength(80);
  expect(sections[0].paragraphs.map((text) => text.length)).toEqual([4000, 1000]);
  expect(sections[79].paragraphs).toEqual(["Own paragraph 78"]);
  expect(capture.observations.limitations).toContain("Content sections exceeded the structural capture limit.");
  expect(capture.text.length).toBeLessThanOrEqual(100000);
  expect(capture.observations.declaredLogos).toEqual([{ selector: "jsonld:Organization/logo", alt: "Example", url: "https://example.com/official.svg" }]);
});
