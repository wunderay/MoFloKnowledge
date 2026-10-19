import { expect, it } from "vitest";
import { Frontier } from "../../src/worker/crawl/frontier";
import { captureHtml } from "../../src/worker/capture/html";

const SITE = "https://acme-wells.example.com/";

function scoreOf(path: string, nav: boolean): number {
  const frontier = new Frontier(SITE, { documentLimit: 15 });
  frontier.add(path, "", 1, undefined, nav);
  return frontier.snapshot().pending.find((item) => item.url.endsWith(path))!.score;
}

it("scores unknown main-navigation targets 75 only when one or two path segments deep", () => {
  expect(scoreOf("/aquifer-mapping/", true)).toBe(75);
  expect(scoreOf("/what-we-do/aquifer-mapping/", true)).toBe(75);
  expect(scoreOf("/what-we-do/aquifer/mapping/", true)).toBeLessThan(75);
});

it("does not flag footer navigation links as main navigation", () => {
  const html = `<!doctype html><html><head><title>t</title></head><body>
<header><nav><a href="/aquifer-mapping/">Aquifer</a></nav></header>
<main><p>${"Text. ".repeat(30)}</p></main>
<footer><nav><a href="/local-history/">History</a></nav></footer></body></html>`;
  const capture = captureHtml({ requestedUrl: SITE, finalUrl: SITE, body: html });
  const nav = (path: string) => capture.links.find((link) => link.url.endsWith(path))?.nav;
  expect(nav("/aquifer-mapping/")).toBe(true);
  expect(nav("/local-history/")).toBeUndefined();
});
