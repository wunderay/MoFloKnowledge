import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { deterministicCandidates } from "../../src/worker/extract/deterministic";
import { technicalObservations } from "../../src/worker/extract/observations";
import type { FieldCandidate } from "../../src/worker/extract/types";

const site = "https://acme-group.example.com";

function extract(path: string, body: string): FieldCandidate[] {
  const url = site + path;
  const page = {
    id: "33333333-3333-4333-8333-333333333333",
    retrievedAt: "2026-10-16T00:00:00Z",
    capture: captureHtml({ requestedUrl: url, finalUrl: url, body }),
  };
  return deterministicCandidates(page, technicalObservations(page));
}

const offeringNames = (candidates: FieldCandidate[]) =>
  [...new Map(candidates.filter((c) => c.field === "/offerings/@id/name")
    .map((c) => [c.entity_key, c])).values()];

const valuesFor = (candidates: FieldCandidate[], field: string, entity_key: string | null) =>
  candidates.filter((c) => c.field === field && c.entity_key === entity_key).map((c) => c.value);

describe("area and catalogue offerings", () => {
  it("turns same-submenu area pages with a shared trailing name into service offerings and service locations", () => {
    const candidates = extract("/",
      `<nav><ul><li><a href="/">Home</a></li><li><a href="/areas">Areas</a><ul>
        <li><a href="/springfield-real-estate">Springfield Real Estate</a></li>
        <li><a href="/riverside-real-estate">Riverside Real Estate</a></li>
        <li><a href="/oakdale-real-estate">Oakdale Real Estate</a></li>
      </ul></li></ul></nav>
      <main><h1>Welcome</h1><p>We help families find homes.</p></main>`);
    const labels = ["Springfield Real Estate", "Riverside Real Estate", "Oakdale Real Estate"];
    for (const label of labels) {
      const name = offeringNames(candidates).find((c) => c.value === label);
      expect(name, label).toBeDefined();
      expect(valuesFor(candidates, "/offerings/@id/category", name!.entity_key), label).toContain("Service");
    }
    const locations = JSON.stringify(candidates.filter((c) => c.field.endsWith("/service_locations")).map((c) => c.value));
    for (const place of ["Springfield", "Riverside", "Oakdale"]) {
      expect(locations, place).toContain(place);
    }
  });

  it("treats a blog index of priced excerpt cards as ordered listing offerings with their stated prices", () => {
    const cards = [
      ["Spring Maintenance Checklist", "$120"],
      ["Gutter Cleaning Guide", "$85"],
      ["Roof Inspection Basics", "£60"],
      ["Attic Ventilation Tips", "€45"],
    ] as const;
    const candidates = extract("/blog",
      `<main><h1>Blog</h1><p>Notes from our crew.</p>${cards.map(([title, price]) =>
        `<article><h3>${title}</h3><p>Short excerpt about ${title.toLowerCase()}.</p><p class="price">${price}</p></article>`).join("")}</main>`);
    const titles: string[] = cards.map(([title]) => title);
    const names = offeringNames(candidates).filter((c) => titles.includes(c.value as string));
    expect(names.map((c) => c.value)).toEqual(titles);
    names.forEach((name, index) => {
      expect(valuesFor(candidates, "/offerings/@id/category", name.entity_key)).toContain("Listing");
      const pricing = JSON.stringify(valuesFor(candidates, "/offerings/@id/pricing", name.entity_key));
      expect(pricing, titles[index]).toContain(cards[index][1].slice(1));
    });
  });

  it("turns each H2 heading with its own paragraph on a services page into an offering", () => {
    const candidates = extract("/what-we-do",
      `<main><h1>Our Services</h1><p>Practical help for local homes.</p>
        <h2>Pipe Inspection</h2><p>We inspect pipes with cameras.</p>
        <h2>Drain Cleaning</h2><p>We clear slow drains the same day.</p>
        <h2>Water Heater Service</h2><p>We repair and replace water heaters.</p></main>`);
    expect(offeringNames(candidates).map((c) => c.value)).toEqual([
      "Pipe Inspection", "Drain Cleaning", "Water Heater Service",
    ]);
  });

  it("does not treat a submenu whose page names share no trailing words as area offerings", () => {
    const labels = ["Springfield Real Estate", "Riverside Plumbing", "Oakdale Dental"];
    const candidates = extract("/",
      `<nav><ul><li><a href="/">Home</a></li><li><a href="/more">More</a><ul>
        ${labels.map((label) => `<li><a href="/${label.toLowerCase().replace(/ /g, "-")}">${label}</a></li>`).join("")}
      </ul></li></ul></nav><main><h1>Welcome</h1><p>We help families.</p></main>`);
    expect(offeringNames(candidates).map((c) => c.value)).not.toEqual(expect.arrayContaining(labels));
    expect(candidates.filter((c) => c.field === "/offerings/@id/category" && c.value === "Service")).toEqual([]);
    const locations = JSON.stringify(candidates.filter((c) => c.field.endsWith("/service_locations")).map((c) => c.value));
    for (const place of ["Springfield", "Riverside", "Oakdale"]) {
      expect(locations).not.toContain(place);
    }
  });
});
