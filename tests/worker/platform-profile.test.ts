import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runAccountIt, runRows, type Row } from "./account-it-run";

const profile = JSON.parse(readFileSync(new URL("../fixtures/github-profile/source_pages.json", import.meta.url), "utf8")) as Row[];
const start = "https://github.com/wunderay/";
const content = (result: ReturnType<typeof runRows>, kind: string) =>
  (result.proposals.find((p) => p.kind === kind)?.content ?? {}) as Record<string, unknown>;
const names = (result: ReturnType<typeof runRows>) =>
  (content(result, "company_foundation").alternative_company_names as { text: string }[] | undefined ?? []).map((n) => n.text);
const market = (result: ReturnType<typeof runRows>, key: string) =>
  (content(result, "market_and_customers")[key] as { url?: string }[] | undefined ?? []);

describe("platform profile extraction", () => {
  const result = runRows(profile, ["/wunderay"], {}, start);
  const unscoped = runRows(profile, ["/wunderay"]);

  it("takes the handle as the alternate name", () => {
    expect(names(result)).toEqual(["wunderay"]);
    expect(names(unscoped)).not.toContain("wunderay");
  });

  it("turns pinned repository cards into offerings with their verbatim description", () => {
    const offerings = result.proposals.filter((p) => p.kind === "offering").map((p) => p.content as unknown as
      { name: string; description?: string | null; url?: string | null });
    expect(offerings.map((o) => o.name).sort()).toEqual(["ContactTracingCU/StopTheSpread", "blogRam", "chattr", "raymondwu"]);
    const spread = offerings.find((o) => o.name === "ContactTracingCU/StopTheSpread");
    expect(spread?.description).toBe("A cross-platform mobile application for COVID-19 contact tracing using React Native.");
    expect(spread?.url).toBe("https://github.com/ContactTracingCU/StopTheSpread");
    expect(offerings.find((o) => o.name === "chattr")).toMatchObject({ url: "https://github.com/wunderay/chattr", description: null });
    expect(unscoped.offerings).toEqual([]);
  });

  it("drops the platform's own calls to action and channels", () => {
    const outside = (url?: string) => url !== undefined && !url.startsWith("https://github.com/wunderay");
    expect(market(unscoped, "ctas").concat(market(unscoped, "channels")).some((item) => outside(item.url))).toBe(true);
    expect(market(result, "ctas").concat(market(result, "channels")).some((item) => outside(item.url))).toBe(false);
    expect(JSON.stringify(result.proposals)).not.toContain("support.github.com");
  });

  it("does not attribute the platform's design to the profile owner", () => {
    const colours = (r: ReturnType<typeof runRows>) => (content(r, "branding_and_style").brand_colors as unknown[] | undefined ?? []).length;
    expect(colours(unscoped)).toBeGreaterThan(0);
    expect(colours(result)).toBe(0);
  });

  it("seeds the overview from the meta description only", () => {
    expect(content(result, "company_foundation").overview).toBe("Software Engineer. wunderay has 18 repositories available. Follow their code on GitHub.");
  });

  it("describes a repository from its About text, verbatim", () => {
    const description = "A small chat application written with EJS templates.";
    const page: Row = {
      normalized_url: "https://github.com/wunderay/chattr", final_url: "https://github.com/wunderay/chattr",
      title: "wunderay/chattr", observations: {
        segments: [{ id: "s1", text: "chattr" }, { id: "s2", text: "About", heading: "About" }, { id: "s3", text: description, heading: "About" }],
        contentSections: [{ level: 2, links: [], heading: "About", listItems: [], paragraphs: [description] }],
        headings: [{ text: "chattr", level: 1 }],
        links: [{ url: "https://github.com/wunderay/chattr", label: "chattr" }],
      } };
    const both = runRows([...profile, page], ["/wunderay", "/wunderay/chattr"], {}, start);
    const chattr = both.proposals.filter((p) => p.kind === "offering").map((p) => p.content as unknown as { name: string; description?: string })
      .filter((o) => o.name === "chattr");
    expect(chattr).toEqual([expect.objectContaining({ description })]);
  });

  it("leaves a site root unchanged", () => {
    const fields = (r: ReturnType<typeof runAccountIt>) => JSON.stringify(r.proposals.map((p) => p.content));
    const paths = ["/", "/about-us/doug-cohen"];
    expect(fields(runRows(JSON.parse(readFileSync(new URL("../fixtures/account-it/pages.json", import.meta.url), "utf8")) as Row[], paths, {}, "https://account-it.net/")))
      .toBe(fields(runAccountIt(paths)));
  });
});
