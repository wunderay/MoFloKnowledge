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
  for (const section of sections) {
    for (const text of [section.heading, ...section.paragraphs, ...section.listItems, ...section.links.map((link) => link.label)].filter(Boolean)) {
      expect(retained.has(text!)).toBe(true);
    }
  }
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

it("retains exact CMS form context and scoped nested lists without blending sibling features", () => {
  const capture = captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: `
    <main><h1>Business services</h1><p>We offer these services:</p>
    <ul><li>Records support<ul><li>Monthly reports</li></ul></li><li>Payroll support</li></ul></main>
    <div><div><h2>Latest Articles</h2><div><p>Receive weekly articles in your inbox.</p><form><label>Email</label><button>Notify me</button></form></div></div></div>
    <div><h2>Contact our team</h2><div><div><form><label>Message</label><button>Submit</button></form></div></div></div>` });
  expect(capture.observations.forms).toContainEqual(expect.objectContaining({ heading: "Latest Articles", context: "Receive weekly articles in your inbox." }));
  expect(capture.observations.forms).toContainEqual(expect.objectContaining({ heading: "Contact our team", context: null }));
  expect(capture.observations.contentLists).toEqual([
    { heading: "Business services", intro: "We offer these services:", items: ["Records support", "Payroll support"] },
    { heading: "Business services", intro: "Records support", items: ["Monthly reports"] },
  ]);
  for (const text of ["Receive weekly articles in your inbox.", "Records support", "Monthly reports", "Payroll support"]) {
    expect(capture.segments.some((segment) => segment.text === text)).toBe(true);
  }
});


it("does not borrow form purpose from sibling chrome or uncaptured text", () => {
  const capture = captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: `
    <main><div><nav><h2>Newsletter</h2><p>Subscribe to the latest articles.</p></nav>
    <aside><h2>Newsletter</h2><p>Subscribe to updates.</p></aside>
    <div class="related-articles"><h2>Newsletter</h2><p>Subscribe for news.</p></div>
    <form><label>Your message</label><button>Send message</button></form></div></main>` });
  expect(capture.observations.forms).toContainEqual(expect.objectContaining({ heading: null, context: null }));
  const exhausted = captureHtml({ requestedUrl: "https://example.com/", finalUrl: "https://example.com/", body: `
    <main><h1>Company</h1><p>${"Long substantive company description. ".repeat(4000)}</p></main>
    <section><h2>Newsletter</h2><p>Receive updates by email.</p><form><label>Email</label></form></section>` });
  expect(exhausted.observations.forms).toContainEqual(expect.objectContaining({ heading: null, context: null }));
  expect(exhausted.observations.limitations).toContain("Captured text exceeded the source segment limit.");
});

it("captures structured page metadata groups with caps and without secrets or script text", () => {
  const filler = Array.from({ length: 80 }, (_v, i) => `<img src="/p${i}.png" alt="Photo ${i}">`).join("");
  const capture = captureHtml({
    requestedUrl: "https://example.com",
    finalUrl: "https://example.com/about/",
    body: `<!doctype html><html lang="en-US"><head><title>Acme</title>
<meta name="description" content="We build things."><meta property="og:site_name" content="Acme Inc"><meta name="twitter:card" content="summary"><meta itemprop="name" content="Acme"><meta name="theme-color" content="#112233"><meta name="geo.region" content="US-CA"><meta name="csrf-token" content="abc123secret"><meta name="note" content="sk_live_abcdefghijklmnop">
<link rel="canonical" href="https://example.com/about"><link rel="alternate" hreflang="fr" href="/fr/about"><link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/a.png"><link rel="manifest" href="/site.webmanifest"><link rel="me" href="https://mastodon.example.org/@acme"><link rel="author" href="/team"><link rel="stylesheet" href="/s.css">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":2,"name":"About","item":"https://example.com/about"},{"@type":"ListItem","position":1,"name":"Home","item":"https://example.com/"}]}</script>
<script>var inlineSecret = "do-not-capture";</script></head>
<body><nav aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/company">Company</a></li><li>About</li></ol></nav>
<main><h1>About</h1>
<div itemscope itemtype="https://schema.org/Organization"><span itemprop="name">Acme Inc</span><a itemprop="url" href="https://example.com/">site</a><div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress"><span itemprop="streetAddress">42 Main St</span></div></div>
<div vocab="https://schema.org/" typeof="Person"><span property="name">Ada Lovelace</span><a property="sameAs" href="https://example.org/ada">profile</a></div>
<p>Email <a href="mailto:hello@example.com?subject=Hi">hello@example.com</a> or call <a href="tel:+1-555-010-2000">555-010-2000</a>.</p>
<address>42 Main St, Springfield</address>
<dl><dt>Founded</dt><dd>1999</dd><dt>Employees</dt><dd>50</dd></dl>
<table><tr><th>Hours</th><td>9-5</td></tr><tr><th>Phone</th><td>555-010-2000</td></tr></table>
<table><tr><th>A</th><th>B</th><th>C</th></tr></table>
<p>Updated <time datetime="2024-05-01">May 1</time></p>
<iframe src="https://www.youtube.com/embed/abc123"></iframe><iframe src="https://player.vimeo.com/video/42"></iframe><iframe src="https://ads.example.net/x"></iframe>
${filler}</main>
<footer><a href="mailto:footer@example.com">Footer mail</a><dl><dt>Footer</dt><dd>skip</dd></dl></footer></body></html>`,
  });
  const o = capture.observations as Record<string, any>;
  expect(o.htmlLang).toBe("en-US");
  expect(o.metaTags).toEqual(expect.arrayContaining([
    { attribute: "name", name: "description", content: "We build things." },
    { attribute: "property", name: "og:site_name", content: "Acme Inc" },
    { attribute: "name", name: "twitter:card", content: "summary" },
    { attribute: "itemprop", name: "name", content: "Acme" },
    { attribute: "name", name: "theme-color", content: "#112233" },
    { attribute: "name", name: "geo.region", content: "US-CA" },
  ]));
  expect(JSON.stringify(o)).not.toMatch(/abc123secret|sk_live_|do-not-capture/);
  expect(o.linkRels).toEqual(expect.arrayContaining([
    { rel: "canonical", href: "https://example.com/about" },
    { rel: "alternate", href: "https://example.com/fr/about", hreflang: "fr" },
    { rel: "icon", href: "https://example.com/favicon.ico" },
    { rel: "apple-touch-icon", href: "https://example.com/a.png", sizes: "180x180" },
    { rel: "manifest", href: "https://example.com/site.webmanifest" },
    { rel: "me", href: "https://mastodon.example.org/@acme" },
    { rel: "author", href: "https://example.com/team" },
  ]));
  expect(o.linkRels.some((l: { href: string }) => l.href.endsWith("s.css"))).toBe(false);
  expect(o.microdata).toContainEqual({ type: "https://schema.org/Organization", props: { name: ["Acme Inc"], url: ["https://example.com/"], address: ["42 Main St"] } });
  expect(o.microdata).toContainEqual({ type: "https://schema.org/PostalAddress", props: { streetAddress: ["42 Main St"] } });
  expect(o.rdfa).toEqual([{ type: "Person", vocab: "https://schema.org/", props: { name: ["Ada Lovelace"], sameAs: ["profile"] } }]);
  expect(o.mailtoLinks).toEqual([{ value: "hello@example.com", text: "hello@example.com" }, { value: "footer@example.com", text: "Footer mail" }]);
  expect(o.telLinks).toEqual([{ value: "+1-555-010-2000", text: "555-010-2000" }]);
  expect(capture.links.some((l) => /mailto|tel:/.test(l.url))).toBe(false);
  expect(o.addresses).toContain("42 Main St, Springfield");
  expect(o.breadcrumbs).toEqual([
    { source: "json-ld", items: [{ name: "Home", url: "https://example.com/" }, { name: "About", url: "https://example.com/about" }] },
    { source: "html", items: [{ name: "Home", url: "https://example.com/" }, { name: "Company", url: "https://example.com/company" }, { name: "About", url: null }] },
  ]);
  expect(o.labelValuePairs).toEqual([
    { label: "Founded", value: "1999", source: "dl" },
    { label: "Employees", value: "50", source: "dl" },
    { label: "Hours", value: "9-5", source: "table" },
    { label: "Phone", value: "555-010-2000", source: "table" },
  ]);
  expect(o.times).toEqual([{ datetime: "2024-05-01", text: "May 1" }]);
  expect(o.images).toHaveLength(50);
  expect(o.images[0]).toEqual({ src: "https://example.com/p0.png", alt: "Photo 0" });
  expect(o.embeds).toEqual([
    { provider: "youtube", url: "https://www.youtube.com/embed/abc123" },
    { provider: "vimeo", url: "https://player.vimeo.com/video/42" },
  ]);
  expect(o.limitations).toContain("Structured page metadata exceeded a capture limit.");
});
