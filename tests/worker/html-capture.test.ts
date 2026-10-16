import { it, expect } from "vitest";
import { captureHtml, shouldRenderPage } from "../../src/worker/capture/html";
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
