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
const nav = `<nav>${[...probes.map(([h]) => h), "Jane Doe"].map((h) => `<a href="/${slug(h)}/">${h}</a>`).join("")}</nav>`;
const page = (h1: string, paragraphs: string[]) =>
  `<html><head><title>${h1} | Acme Group</title></head><body>${nav}<main><h1>${h1}</h1><h2>Fast Response</h2>` +
  `${paragraphs.map((p) => `<p>${p}</p>`).join("")}</main></body></html>`;
const pages = [
  { path: "/", html: `<html><head><title>Acme Group</title></head><body>${nav}<main><h1>Acme Group</h1><p>Acme Group helps families plan for retirement and protect what they have built.</p></main></body></html>` },
  ...probes.map(([h, p]) => ({ path: `/${slug(h)}/`, html: page(h, p) })),
  { path: "/jane-doe/", html: page("Jane Doe", [
    "Jane Doe has spent twenty years helping families plan for retirement. She leads client strategy.",
    "She holds a degree in finance and is certified in estate planning."]) },
];
const rows: Row[] = pages.map(({ path, html }) => {
  const capture = captureHtml({ requestedUrl: origin + path, finalUrl: origin + path, body: html });
  return { normalized_url: capture.normalizedUrl, final_url: capture.finalUrl, title: capture.title ?? "",
    observations: { ...capture.observations, segments: capture.segments, links: capture.links } };
});
const people = () => runRows(rows, pages.map((p) => p.path), {}, `${origin}/`).proposals
  .filter((p) => p.kind === "key_person").map((p) => p.content as unknown as { name: string; title: string | null; gender: string | null });

describe("people profile guards", () => {
  it("does not read topic, service or navigation headings as people", () => {
    expect(people().map((p) => p.name)).toEqual(["Jane Doe"]);
  });
  it("keeps a real profile with its title and gender", () => {
    expect(people()[0]).toMatchObject({ name: "Jane Doe", title: "Fast Response", gender: "Female" });
  });
});
