import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Frontier } from "../../src/worker/crawl/frontier";
import { runRows, type Row } from "./account-it-run";

const profile = JSON.parse(readFileSync(new URL("../fixtures/github-profile/source_pages.json", import.meta.url), "utf8")) as Row[];
const start = "https://github.com/wunderay/";

/** A captured platform page shaped like the fixture's profile row (same observation keys, one row per page). */
const platformPage = (finalUrl: string, title: string, segments: { id: string; text: string; heading?: string }[],
  contentSections: { level: number; heading: string | null; links: unknown[]; listItems: unknown[]; paragraphs: string[] }[],
  links: { url: string; label: string }[], extra: Record<string, unknown> = {}): Row => ({
  normalized_url: finalUrl,
  final_url: finalUrl,
  title,
  observations: {
    segments,
    contentSections,
    headings: [],
    links,
    ctas: [],
    forms: [],
    jsonLd: [],
    addresses: [],
    priceText: [],
    redirects: [],
    truncated: false,
    limitations: [],
    socialLinks: [],
    contentLists: [],
    declaredLogos: [],
    declaredStyles: [],
    offeringBlocks: [],
    metaDescription: null,
    ...extra,
  },
});

it("never selects platform utility sub-pages of a profile item", () => {
  const frontier = new Frontier("https://github.com/wunderay");
  const candidates: [string, string][] = [
    ["/wunderay/blogRam/actions", "Actions"],
    ["/wunderay/blogRam/issues", "Issues"],
    ["/wunderay/chattr/blob/main/x.js", "x.js"],
    ["/wunderay/chattr", "chattr"],
  ];
  for (const [url, label] of candidates) {
    frontier.add(url, label, 1);
  }
  const selected: string[] = [];
  for (let item = frontier.next(); item; item = frontier.next()) {
    selected.push(new URL(item.url).pathname);
  }
  // The start URL is always queued by the constructor, so it is excluded from the check.
  expect(selected.filter((path) => path !== "/wunderay")).toEqual(["/wunderay/chattr"]);
});

it("ignores a captured platform sub-page when extracting the profile", () => {
  const actions = platformPage(
    "https://github.com/wunderay/blogRam/actions",
    "Actions · wunderay/blogRam",
    [
      { id: "s1", text: "Actions" },
      { id: "s2", text: "Automate your workflow and save hours of manual release work from idea to production" },
    ],
    [{ level: 2, heading: "Actions", links: [], listItems: [], paragraphs: ["Automate your workflow and save hours of manual release work from idea to production"] }],
    [{ url: "https://github.com/wunderay/blogRam/actions", label: "Actions" }],
  );
  const result = runRows([actions], ["/wunderay/blogRam/actions"], {}, start);
  expect(JSON.stringify(result.proposals)).not.toContain("Automate your workflow and save hours of manual release work from idea to production");
  expect(result.buyers).toEqual([]);
});

it("takes the description of a repository whose README heading is the repo name", () => {
  const description = "A social media website built on Bootstrap, Express.js, Node.js, and MongoDB.";
  const chattr = platformPage(
    "https://github.com/wunderay/chattr",
    "wunderay/chattr",
    [
      { id: "s1", text: "chattr" },
      { id: "s2", text: description, heading: "chattr" },
    ],
    [{ level: 1, heading: "chattr", links: [], listItems: [], paragraphs: [description] }],
    [{ url: "https://github.com/wunderay/chattr", label: "chattr" }],
  );
  const result = runRows([chattr], ["/wunderay/chattr"], {}, start);
  const offerings = result.proposals.filter((p) => p.kind === "offering").map((p) => p.content as unknown as
    { name: string; description?: string | null });
  expect(offerings.find((o) => o.name === "chattr")?.description).toBe(description);
});

it("gives the profile owner as a key person from microdata", () => {
  const overview = "Software Engineer. wunderay has 18 repositories available. Follow their code on GitHub.";
  const row = profile[0];
  const withMicrodata: Row = {
    ...row,
    observations: {
      ...row.observations,
      microdata: [{
        type: "https://schema.org/Person",
        props: { name: ["Raymond Wu"], jobTitle: ["Software Engineer"], description: [overview] },
      }],
    },
  };
  const result = runRows([withMicrodata], ["/wunderay"], {}, start);
  const people = result.proposals.filter((p) => p.kind === "key_person").map((p) => p.content as unknown as { name?: string });
  expect(people.map((p) => p.name)).toContain("Raymond Wu");
});
