import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { technicalObservations } from "../../src/worker/extract/observations";
import { validateCandidates } from "../../src/worker/extract/validate-candidates";
import type { FieldCandidate } from "../../src/worker/extract/types";

const site = "https://acme-group.example.com";

/** Mirrors the pipeline: each candidate is validated on its own and a rejection counts as a failure. */
function validated(path: string, body: string) {
  const url = site + path;
  const page = {
    id: "33333333-3333-4333-8333-333333333333",
    retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }),
  };
  const observations = technicalObservations(page);
  const kept: FieldCandidate[] = [];
  let failures = 0;
  for (const candidate of deterministicCandidates(page, observations)) {
    try {
      kept.push(...validateCandidates([candidate], page, observations, "company-1"));
    } catch {
      failures++;
    }
  }
  return { kept, failures };
}

const names = (candidates: FieldCandidate[]) =>
  [...new Set(candidates.filter((c) => c.field === "/offerings/@id/name").map((c) => c.value))];

describe("area and catalogue offerings survive validation", () => {
  it("keeps area page offerings and service locations", () => {
    const { kept, failures } = validated("/",
      `<nav><ul><li><a href="/">Home</a></li><li><a href="/areas">Areas</a><ul>
        <li><a href="/springfield-real-estate">Springfield Real Estate</a></li>
        <li><a href="/riverside-real-estate">Riverside Real Estate</a></li>
      </ul></li></ul></nav><main><h1>Welcome</h1><p>We help families find homes.</p></main>`);
    expect(failures).toBe(0);
    expect(names(kept)).toEqual(["Springfield Real Estate", "Riverside Real Estate"]);
    expect(JSON.stringify(kept.filter((c) => c.field.endsWith("/service_locations")))).toContain("Riverside");
  });

  it("keeps priced catalogue cards", () => {
    const { kept, failures } = validated("/blog",
      `<main><h1>Blog</h1>${["A", "B", "C"].map((t, i) =>
        `<article><h3>Guide ${t}</h3><p>Excerpt ${t}.</p><p class="price">$${i + 1}0</p></article>`).join("")}</main>`);
    expect(failures).toBe(0);
    expect(names(kept)).toEqual(["Guide A", "Guide B", "Guide C"]);
    expect(kept.filter((c) => c.field === "/offerings/@id/pricing")).toHaveLength(3);
  });

  it("keeps service-list sections", () => {
    const { kept, failures } = validated("/what-we-do",
      `<main><h1>Our Services</h1><p>Practical help.</p>
        <h2>Pipe Inspection</h2><p>We inspect pipes with cameras.</p>
        <h2>Drain Cleaning</h2><p>We clear slow drains the same day.</p></main>`);
    expect(failures).toBe(0);
    expect(names(kept)).toEqual(["Pipe Inspection", "Drain Cleaning"]);
  });

  it("gives chrome-like submenus no service locations", () => {
    const { kept } = validated("/",
      `<nav><ul><li><a href="/x">Company</a><ul>
        <li><a href="/a">Privacy Policy</a></li><li><a href="/b">Cookie Policy</a></li>
        <li><a href="/c">Residential Services</a></li><li><a href="/d">Commercial Services</a></li>
      </ul></li></ul></nav><main><h1>Welcome</h1><p>Hello there.</p></main>`);
    expect(names(kept)).not.toContain("Privacy Policy");
    expect(kept.filter((c) => c.field.endsWith("/service_locations"))).toEqual([]);
  });
});
