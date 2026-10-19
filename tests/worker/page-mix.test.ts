import { afterEach, beforeEach, expect, it } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import {
  makeJob,
  makeRepository,
  sendHtml,
  sendRobots,
  startSite,
  type Site,
  type SiteHandler,
} from "../helpers/crawl-deadline-site";

// Page mix within a 15-document budget. Acceptance tests through the public crawl entry point:
// runCrawl fetches a fictional site from a loopback server through the real pinned transport and
// the assertions read which pages were captured. Fixture host is fictional.

const HOST = "acme-wells.example.com";
const ROOT = `http://${HOST}/`;
const DOCUMENT_LIMIT = 15;

// Main-navigation Services submenu: unknown words, so only the nav placement identifies them.
const NAV_SERVICES = [
  "/aquifer-mapping/",
  "/borehole-logging/",
  "/casing-repair/",
  "/pump-swaps/",
  "/well-disinfection/",
  "/pressure-tanks/",
  "/water-softeners/",
  "/backflow-testing/",
];

// Quote, estimate and request pages (the funnel kind that must not crowd out service pages).
const QUOTE_KIND = [
  "/request-estimate/",
  "/get-a-quote/",
  "/free-estimate/",
  "/quote-request/",
];

// Body and footer links with their own rules, plus unknown pages linked only from the body/footer.
const BODY_LINKS = [
  "/staff/",
  "/testimonials/",
  "/financing/",
  "/contact/",
  "/join-our-team/",
  "/troubleshooting/home/",
];
const BODY_ONLY_UNKNOWN = [
  "/community-events/",
  "/local-history/",
  "/field-notes/",
  "/seasonal-tips/",
  "/equipment-catalog/",
  "/water-facts/",
];

const BODY =
  "Acme Wells drills and services private water wells for rural households. ".repeat(5);

const anchor = (href: string) => `<a href="${href}">${href}</a>`;

const HOME = `<!doctype html><html><head><title>Acme Wells</title></head><body>
<nav><ul><li>Services<ul>${NAV_SERVICES.map((href) => `<li>${anchor(href)}</li>`).join("")}</ul></li></ul></nav>
<main><h1>Acme Wells</h1><p>${BODY}</p>${[...QUOTE_KIND, ...BODY_LINKS, ...BODY_ONLY_UNKNOWN].map(anchor).join("")}</main>
</body></html>`;

const pages: Record<string, string> = {
  "/": HOME,
  ...Object.fromEntries(
    [...NAV_SERVICES, ...QUOTE_KIND, ...BODY_LINKS, ...BODY_ONLY_UNKNOWN].map((href) => [
      href,
      `<!doctype html><html><head><title>${href}</title></head><body><main><p>${BODY}</p></main></body></html>`,
    ]),
  ),
};

function serve(): SiteHandler {
  return (request, response) => {
    if (request.path === "/robots.txt") {
      return sendRobots(response, "User-agent: *\nAllow: /");
    }
    if (Object.hasOwn(pages, request.path)) {
      return sendHtml(response, pages[request.path]);
    }
    response.writeHead(404).end();
  };
}

let site: Site | undefined;
let previousGap: string | undefined;

beforeEach(() => {
  // Keeps the per-host pacing gap out of the test runtime; the crawl logic is unchanged.
  previousGap = process.env.CRAWL_HOST_GAP_MS;
  process.env.CRAWL_HOST_GAP_MS = "0";
});

afterEach(async () => {
  if (previousGap === undefined) {
    delete process.env.CRAWL_HOST_GAP_MS;
  } else {
    process.env.CRAWL_HOST_GAP_MS = previousGap;
  }
  await site?.close();
  site = undefined;
});

it("captures all main-navigation service pages within 15 documents, without the quote, careers, troubleshooting or unknown body-only pages crowding them out", async () => {
  site = await startSite(serve());
  const result = await runCrawl(
    makeJob(ROOT, DOCUMENT_LIMIT),
    makeRepository(),
    new AbortController().signal,
    undefined,
    site.fetcher,
  );
  const captured = result.captures.map((item) => new URL(item.capture.finalUrl).pathname);
  const summary = `captured: ${captured.join(", ")}`;

  const missingServices = NAV_SERVICES.filter((path) => !captured.includes(path));
  expect(missingServices, `main-navigation service pages not captured; ${summary}`).toEqual([]);

  const quoteCaptured = QUOTE_KIND.filter((path) => captured.includes(path));
  expect(quoteCaptured.length, `quote-kind pages captured: ${quoteCaptured.join(", ")}; ${summary}`).toBeLessThanOrEqual(2);

  expect(captured, summary).not.toContain("/join-our-team/");
  expect(captured, summary).not.toContain("/troubleshooting/home/");

  const bodyOnlyCaptured = BODY_ONLY_UNKNOWN.filter((path) => captured.includes(path));
  expect(bodyOnlyCaptured.length, `body-only unknown pages captured: ${bodyOnlyCaptured.join(", ")}; ${summary}`).toBeLessThanOrEqual(1);
});
