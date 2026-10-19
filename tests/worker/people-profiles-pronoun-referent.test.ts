import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { runRows, type Row } from "./account-it-run";

const origin = "https://acme-group.example.com";
const nav = `<nav><span>Our Team</span><ul><li><a href="/jane-doe/">Jane Doe</a></li></ul></nav>`;
const home = { path: "/", html: `<html><head><title>Acme Group</title></head><body>${nav}<main><h1>Acme Group</h1><p>Acme Group helps families plan for retirement and protect what they have built.</p></main></body></html>` };
const profile = (bio: string) => ({ path: "/jane-doe/", html:
  `<html><head><title>Jane Doe | Acme Group</title></head><body>${nav}<main><h1>Jane Doe</h1><h2>Fast Response</h2><p>${bio}</p></main></body></html>` });
// Runs the home page and the profile through the same capture, candidate, validation and reduce steps as a crawl.
const genderFor = (bio: string) => {
  const pages = [home, profile(bio)];
  const rows: Row[] = pages.map(({ path, html }) => {
    const capture = captureHtml({ requestedUrl: origin + path, finalUrl: origin + path, body: html });
    return { normalized_url: capture.normalizedUrl, final_url: capture.finalUrl, title: capture.title ?? "",
      observations: { ...capture.observations, segments: capture.segments, links: capture.links } };
  });
  const people = runRows(rows, pages.map((p) => p.path), {}, `${origin}/`).proposals
    .filter((p) => p.kind === "key_person").map((p) => p.content as unknown as { name: string; gender: string | null });
  expect(people.map((p) => p.name)).toEqual(["Jane Doe"]);
  return people[0].gender;
};

describe("people profile pronoun referent", () => {
  it("leaves gender unknown when the bio's pronoun may refer to another named person", () => {
    expect(genderFor("Jane Doe works closely with John Smith on retirement planning. He leads client strategy.")).toBeNull();
  });
  it("still reads gender from a pronoun directly after the naming sentence", () => {
    expect(genderFor("Jane Doe helps families plan for retirement. She leads client strategy.")).toBe("Female");
  });
});
