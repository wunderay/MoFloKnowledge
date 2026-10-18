import { afterEach, beforeEach, expect, it } from "vitest";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import {
  htmlPage,
  makeJob,
  makeRepository,
  sendHtml,
  sendRobots,
  startSite,
  type Site,
} from "../helpers/crawl-deadline-site";

// Pages captured at the same time share one per-crawl allowance of linked stylesheets.

const ROOT = "http://acme-group.example.com/";

let site: Site | undefined;
let previousGap: string | undefined;

beforeEach(() => {
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

const sheet = (href: string) => `<link rel="stylesheet" href="${href}">`;

function page(sheets: string[], links: string[] = []): string {
  return `<!doctype html><html><head><title>Acme Group</title>${sheets.map(sheet).join("")}</head><body>${htmlPage(links)}</body></html>`;
}

it("fetches each shared stylesheet once and at most 6 in a crawl when pages are captured together", async () => {
  const shared = ["/s1.css", "/s2.css", "/s3.css"];
  const pages: Record<string, string> = {
    "/": page([], ["/a", "/b", "/c"]),
    "/a": page([...shared, "/a1.css", "/a2.css"]),
    "/b": page([...shared, "/b1.css", "/b2.css"]),
    "/c": page([...shared, "/c1.css", "/c2.css"]),
  };
  site = await startSite((request, response) => {
    if (request.path === "/robots.txt") {
      return sendRobots(response, "User-agent: *\nAllow: /");
    }
    if (request.path.endsWith(".css")) {
      return response
        .writeHead(200, { "content-type": "text/css" })
        .end(":root{--c-one:#111111}");
    }
    if (Object.hasOwn(pages, request.path)) {
      return sendHtml(response, pages[request.path]);
    }
    response.writeHead(404).end();
  });
  const result = await runCrawl(
    makeJob(ROOT, 5),
    makeRepository(),
    new AbortController().signal,
    undefined,
    site.fetcher,
  );
  expect(result.captures).toHaveLength(4);
  const fetched = site.hits
    .filter((hit) => hit.path.endsWith(".css"))
    .map((hit) => hit.path);
  expect(new Set(fetched).size).toBe(fetched.length);
  expect(fetched.length).toBeLessThanOrEqual(6);
  for (const path of shared) {
    expect(fetched).toContain(path);
  }
});
