import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { runRows, type Row } from "./account-it-run";

const origin = "https://acme-group.example.com";
const slug = (text: string) => text.toLowerCase().replace(/[^a-z]+/g, "-");
const probes: [string, string[]][] = [
  ["Water Well Drilling", ["We handle water well drilling for farms and homes across the county.", "Our crew arrives with its own rig."]],
  ["Tax Preparation Services", ["Tax Preparation Services for households and small firms.", "Appointments fill up early in spring."]],
  ["Paradise Valley Real Estate", ["Browse every paradise valley real estate listing we manage.", "New homes are added weekly."]],
  ["NightOwl Flex", ["NightOwl Flex keeps the studio open late for members.", "Classes run until midnight."]],
  ["Contact Us", ["Contact us today to book a visit with the whole team.", "We answer within one day."]],
  ["Our Team", ["Our team has served the county for years and cares about every client.", "We stay for the long run."]],
  ["Our Services", ["Our services cover planning, filing and review for every client.", "Ask about the full list."]],
  ["About Us", ["About Us: the firm was founded by Sam Lee, and he still reviews every file himself.", "We serve the whole county."]],
];
const plain: [string, string[]][] = [
  ["Pump Repair", ["Pump Repair for wells, sumps and irrigation lines of every size.", "Parts are stocked on the truck."]],
  ["Hair Coloring", ["Hair Coloring starts with a chat about the look you want, and she will consult first.", "Colour care tips follow every visit."]],
];
const link = (h: string) => `<li><a href="/${slug(h)}/">${h}</a></li>`;
const nav = `<nav><span>Our Team</span><ul>${link("Jane Doe")}</ul><span>Services</span><ul>${probes.map(([h]) => link(h)).join("")}</ul></nav>`;
const page = (h1: string, paragraphs: string[], menu = nav) =>
  `<html><head><title>${h1} | Acme Group</title></head><body>${menu}<main><h1>${h1}</h1><h2>Fast Response</h2>` +
  `${paragraphs.map((p) => `<p>${p}</p>`).join("")}</main></body></html>`;
const home = { path: "/", html: `<html><head><title>Acme Group</title></head><body>${nav}<main><h1>Acme Group</h1><p>Acme Group helps families plan for retirement and protect what they have built.</p></main></body></html>` };
const jane = { path: "/jane-doe/", html: page("Jane Doe", [
  "Jane Doe has spent twenty years helping families plan for retirement. She leads client strategy.",
  "She holds a degree in finance and is certified in estate planning."]) };
// The test runner numbers sources with a single digit, so each probe runs with the home page and a real profile.
const people = (extra: { path: string; html: string }[]) => {
  const pages = [home, ...extra, jane];
  const rows: Row[] = pages.map(({ path, html }) => {
    const capture = captureHtml({ requestedUrl: origin + path, finalUrl: origin + path, body: html });
    return { normalized_url: capture.normalizedUrl, final_url: capture.finalUrl, title: capture.title ?? "",
      observations: { ...capture.observations, segments: capture.segments, links: capture.links } };
  });
  return runRows(rows, pages.map((p) => p.path), {}, `${origin}/`).proposals
    .filter((p) => p.kind === "key_person").map((p) => p.content as unknown as { name: string; title: string | null; gender: string | null });
};

describe("people profile guards", () => {
  it.each(probes)("does not read %s as a person", (h, paragraphs) => {
    expect(people([{ path: `/${slug(h)}/`, html: page(h, paragraphs) }]).map((p) => p.name)).toEqual(["Jane Doe"]);
  });
  it("keeps a real profile with its title and gender", () => {
    expect(people([])[0]).toMatchObject({ name: "Jane Doe", title: "Fast Response", gender: "Female" });
  });
  // Service pages with a short line and a name-led first sentence, on a site that has no team-group label.
  it.each(plain)("does not read %s as a person without a team label", (h, paragraphs) => {
    const menu = `<nav><a href="/${slug(h)}/">${h}</a></nav>`;
    expect(people([{ path: `/${slug(h)}/`, html: page(h, paragraphs, menu) }]).map((p) => p.name)).toEqual(["Jane Doe"]);
  });
  // The sitewide menu has a team submenu holding the real profile and a services submenu holding a service page.
  it("reads only the profile listed under the team submenu", () => {
    const menu = nav.replace("</ul></nav>", link("Pump Repair") + "</ul></nav>");
    const service = { path: "/pump-repair/", html: page("Pump Repair", ["Pump Repair for wells, sumps and irrigation lines of every size.", "Parts are stocked on the truck."], menu) };
    expect(people([service]).map((p) => p.name)).toEqual(["Jane Doe"]);
  });
  // A "Name - title" or "Name, title" page title does not make a service page a person.
  it.each(["Pump Repair - Fast Response", "Pump Repair, Fast And Local"])("does not read a page titled %s as a person", (title) => {
    const body = ["Pump Repair for wells, sumps and irrigation lines of every size.", "Parts are stocked on the truck."];
    const html = (menu: string) => `<html><head><title>${title} | Acme Group</title></head><body>${menu}<main><h1>Pump Repair</h1>` +
      `<h2>Fast Response</h2>${body.map((p) => `<p>${p}</p>`).join("")}</main></body></html>`;
    const listed = nav.replace("</ul></nav>", link("Pump Repair") + "</ul></nav>");
    for (const menu of [listed, ""]) {
      expect(people([{ path: "/pump-repair/", html: html(menu) }]).map((p) => p.name)).toEqual(["Jane Doe"]);
    }
  });
});
