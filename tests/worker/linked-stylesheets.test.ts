import { afterEach, beforeEach, expect, it } from "vitest";
import { runCrawl, type StoredCapture } from "../../src/worker/crawl/run-crawl";
import { technicalObservations } from "../../src/worker/extract/observations";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import type { FieldCandidate } from "../../src/worker/extract/types";
import {
  htmlPage,
  makeJob,
  makeRepository,
  sendHtml,
  sendRobots,
  startSite,
  type Site,
  type SiteHandler,
} from "../helpers/crawl-deadline-site";

// Linked stylesheets. Acceptance tests through the public crawl and extraction
// entry points: runCrawl fetches the page through the real pinned transport
// against a loopback server, then technicalObservations and deterministicCandidates
// read what was captured. Fixture hosts are fictional.

const HOST = "acme-group.example.com";
const ROOT = `http://${HOST}/`;
const CROSS_HOST = "cdn.northwind-assets.example.net";

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

function serve(
  pages: Record<string, string>,
  sheets: Record<string, string>,
): SiteHandler {
  return (request, response) => {
    if (request.path === "/robots.txt") {
      return sendRobots(response, "User-agent: *\nAllow: /");
    }
    if (Object.hasOwn(sheets, request.path)) {
      return response
        .writeHead(200, { "content-type": "text/css" })
        .end(sheets[request.path]);
    }
    if (Object.hasOwn(pages, request.path)) {
      return sendHtml(response, pages[request.path]);
    }
    response.writeHead(404).end();
  };
}

const sheet = (href: string) => `<link rel="stylesheet" href="${href}">`;

function page(head: string, links: string[] = []): string {
  return `<!doctype html><html><head><title>Acme Group</title>${head}</head><body>${htmlPage(links)}</body></html>`;
}

async function crawlSite(handler: SiteHandler, maxPages = 5) {
  site = await startSite(handler);
  const result = await runCrawl(
    makeJob(ROOT, maxPages),
    makeRepository(),
    new AbortController().signal,
    undefined,
    site.fetcher,
  );
  const root = result.captures.find((c) => c.capture.finalUrl === ROOT);
  return { result, root, hits: site.hits };
}

function extract(root: StoredCapture): FieldCandidate[] {
  return deterministicCandidates(root, technicalObservations(root));
}

// Font families as the primary name, without quotes or fallbacks.
function families(candidates: FieldCandidate[]): string[] {
  return candidates
    .filter((c) => c.field === "/branding_and_style/fonts")
    .flatMap((c) =>
      (c.value as { family: string }[]).map((font) =>
        font.family.replace(/["']/g, "").split(",")[0].trim(),
      ),
    );
}

function colours(candidates: FieldCandidate[]): string[] {
  return candidates
    .filter((c) => c.field === "/branding_and_style/brand_colors")
    .flatMap((c) =>
      (Array.isArray(c.value) ? (c.value as { hex: string }[]) : []).map(
        (color) => color.hex.toLowerCase(),
      ),
    );
}

it("applies font and colour custom properties declared in a same-host linked stylesheet", async () => {
  const { root } = await crawlSite(
    serve(
      { "/": page(sheet("/assets/site.css")) },
      {
        "/assets/site.css":
          ':root{--e-font:"Roboto", sans-serif;--c-primary:#CBA63E}body{font-family:var(--e-font)}',
      },
    ),
  );
  expect(root, "home page was not captured").toBeDefined();
  const candidates = extract(root!);
  expect(families(candidates)).toEqual(["Roboto"]);
  expect(colours(candidates)).toContain("#cba63e");
});

it("does not fetch or apply a stylesheet from another registrable domain", async () => {
  const { root, hits } = await crawlSite(
    serve(
      {
        "/": page(
          sheet("/assets/site.css") +
            sheet(`https://${CROSS_HOST}/theme.css`),
        ),
      },
      {
        "/assets/site.css": ":root{--c-primary:#CBA63E}",
        "/theme.css": ":root{--c-cross:#123ABC}",
      },
    ),
  );
  expect(root, "home page was not captured").toBeDefined();
  expect(
    hits.some((hit) => hit.host === HOST && hit.path === "/assets/site.css"),
  ).toBe(true);
  expect(hits.some((hit) => hit.host === CROSS_HOST)).toBe(false);
  const found = colours(extract(root!));
  expect(found).toContain("#cba63e");
  expect(found).not.toContain("#123abc");
});

it("does not count stylesheet fetches against the document limit", async () => {
  const sheets = {
    "/assets/one.css": ":root{--c-one:#111111}",
    "/assets/two.css": ":root{--c-two:#222222}",
    "/assets/three.css": ":root{--c-three:#333333}",
  };
  const { result, hits } = await crawlSite(
    serve(
      {
        "/": page(
          sheet("/assets/one.css") +
            sheet("/assets/two.css") +
            sheet("/assets/three.css"),
          ["/about", "/contact"],
        ),
        "/about": page(""),
        "/contact": page(""),
      },
      sheets,
    ),
    3,
  );
  expect(result.captures.map((c) => c.capture.finalUrl).sort()).toEqual(
    [ROOT, `${ROOT}about`, `${ROOT}contact`].sort(),
  );
  for (const path of Object.keys(sheets)) {
    expect(hits.some((hit) => hit.host === HOST && hit.path === path)).toBe(
      true,
    );
  }
});

it("truncates an oversized linked stylesheet at the cap without failing the crawl", async () => {
  const oversized =
    ":root{--c-primary:#CBA63E}/*" +
    "x".repeat(2 * 1024 * 1024) +
    "*/.late{--c-late:#010203}";
  const { result, root } = await crawlSite(
    serve(
      { "/": page(sheet("/assets/big.css")) },
      { "/assets/big.css": oversized },
    ),
  );
  expect(result.errors.map((e) => e.code)).not.toContain("capture_failed");
  expect(result.captures).toHaveLength(1);
  expect(root, "home page was not captured").toBeDefined();
  const found = colours(extract(root!));
  expect(found).toContain("#cba63e");
  expect(found).not.toContain("#010203");
});
