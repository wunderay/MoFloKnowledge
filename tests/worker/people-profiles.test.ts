import { describe, expect, it } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";
import { runRows, type Row } from "./account-it-run";

const origin = "https://acme-group.example.com";
const nav = `<nav><a href="/">Home</a><span>Our Team</span><ul>` +
  `<li><a href="/jane-doe/">Jane Doe</a></li>` +
  `<li><a href="/john-roe/">John Roe</a></li>` +
  `<li><a href="/maria-lopez/">Maria Lopez</a></li>` +
  `</ul></nav>`;
const profile = (name: string, heading: string, paragraphs: string[]) =>
  `<html><head><title>${name} | Acme Group</title></head><body>${nav}<main>` +
  `<h1>${name}</h1><h2>${heading}</h2>${paragraphs.map((p) => `<p>${p}</p>`).join("")}` +
  `</main><footer><a href="/">Acme Group</a></footer></body></html>`;

const pages: { path: string; html: string }[] = [
  { path: "/", html: `<html><head><title>Acme Group | Springfield Experts</title></head><body>${nav}<main>` +
    `<h1>Acme Group</h1><p>Acme Group helps families plan for retirement and protect what they have built.</p>` +
    `</main></body></html>` },
  { path: "/jane-doe/", html: profile("Jane Doe", "Founding Partner", [
    "Jane Doe has spent twenty years helping families plan for retirement. She leads client strategy and mentors every new adviser on the team.",
    "She holds a degree in finance and is certified in estate planning.",
  ]) },
  { path: "/john-roe/", html: profile("John Roe", "Lead Technician", [
    "John Roe founded the region's first irrigation audit service. He leads field operations and reviews every site visit himself.",
    "His crews trust his judgement on complex installs.",
  ]) },
  // No pronouns anywhere in the bio: gender must stay unknown even though the name is typically female.
  { path: "/maria-lopez/", html: profile("Maria Lopez", "Assistant", [
    "Maria Lopez coordinates appointments and client files for the whole office.",
    "Clients often describe the front desk as the calmest part of their week.",
  ]) },
  // Same H1 shape as a profile, but no page in the site links to it by this name.
  { path: "/riley-stone/", html: profile("Riley Stone", "Consultant", [
    "Riley Stone reviews permit applications for commercial clients. He works from the Springfield office on weekdays.",
  ]) },
  // A comment handle and an e-mail address appear in a post; neither is a person.
  { path: "/news/launch-day/", html: `<html><head><title>Launch Day Update | Acme Group</title></head><body>${nav}<main>` +
    `<h1>Launch Day Update</h1><p>We opened the new Springfield office this week and thank everyone who visited.</p>` +
    `<section class="comments"><h2>Comments</h2>` +
    `<p><a href="/jdoe-22/">@jdoe_22</a> wrote: Congratulations to the whole team.</p>` +
    `<p>Questions? Write to <a href="mailto:jdoe@example.com">jdoe@example.com</a>.</p>` +
    `</section></main></body></html>` },
  { path: "/jdoe-22/", html: `<html><head><title>@jdoe_22 | Acme Group</title></head><body>${nav}<main>` +
    `<h1>@jdoe_22</h1><h2>Commenter</h2><p>Joined the discussion on launch day.</p>` +
    `</main></body></html>` },
];

const rows: Row[] = pages.map(({ path, html }) => {
  const capture = captureHtml({ requestedUrl: origin + path, finalUrl: origin + path, body: html });
  return {
    normalized_url: capture.normalizedUrl,
    final_url: capture.finalUrl,
    title: capture.title ?? "",
    observations: { ...capture.observations, segments: capture.segments, links: capture.links },
  };
});
const allPaths = pages.map((page) => page.path);
const run = () => runRows(rows, allPaths, {}, `${origin}/`);

interface KeyPerson {
  name: string | null;
  title: string | null;
  gender: string | null;
  background_or_relevance: string | null;
}
const keyPeople = (result: ReturnType<typeof run>) =>
  result.proposals.filter((p) => p.kind === "key_person").map((p) => p.content as unknown as KeyPerson);

describe("people profiles from a team navigation menu", () => {
  it("turns three linked profile pages into key people with title, bio and gender", () => {
    const people = keyPeople(run());
    expect(people.map((p) => p.name).sort()).toEqual(["Jane Doe", "John Roe", "Maria Lopez"]);

    const byName = new Map(people.map((p) => [p.name, p]));
    expect(byName.get("Jane Doe")).toMatchObject({ title: "Founding Partner", gender: "Female" });
    expect(byName.get("Jane Doe")?.background_or_relevance).toContain("Jane Doe has spent twenty years");
    expect(byName.get("John Roe")).toMatchObject({ title: "Lead Technician", gender: "Male" });
    expect(byName.get("John Roe")?.background_or_relevance).toContain("John Roe founded the region's first irrigation audit service");
    expect(byName.get("Maria Lopez")).toMatchObject({ title: "Assistant" });
    expect(byName.get("Maria Lopez")?.gender ?? null).toBeNull();
    expect(byName.get("Maria Lopez")?.background_or_relevance).toContain("Maria Lopez coordinates appointments");
  });

  it("does not treat an H1 that no other page links by that name as a person", () => {
    const people = keyPeople(run());
    expect(people.map((p) => p.name)).not.toContain("Riley Stone");
    expect(JSON.stringify(people)).not.toContain("Riley Stone");
  });

  it("never produces a comment handle or an e-mail address as a key person", () => {
    const people = keyPeople(run());
    expect(JSON.stringify(people)).not.toMatch(/@|jdoe/i);
    for (const person of people) {
      expect(person.name ?? "").not.toMatch(/[@\d_]/);
    }
  });
});
