import { it, expect } from "vitest";
import { captureHtml } from "../../src/worker/capture/html";

const page = (body: string) => ({
  requestedUrl: "https://acme-group.example.com/team",
  finalUrl: "https://acme-group.example.com/team",
  body,
});

it("keeps team names and roles inside an ancestor styled visibility:hidden", () => {
  const capture = captureHtml(
    page(`<main><h1>Our team</h1><div style="visibility:hidden"><section><h2>Leadership</h2>
      <div class="card"><h3>Nadia Okafor</h3><p>Chief Executive Officer</p></div>
      <div class="card"><h3>Marcus Lindqvist</h3><p>Chief Technology Officer</p></div>
      <div class="card"><h3>Priya Raman</h3><p>Head of Operations</p></div>
    </section></div></main>`),
  );
  for (const text of [
    "Nadia Okafor",
    "Chief Executive Officer",
    "Marcus Lindqvist",
    "Chief Technology Officer",
    "Priya Raman",
    "Head of Operations",
  ]) {
    expect(capture.text).toContain(text);
  }
});

it("keeps a display:none block out of captured text", () => {
  const capture = captureHtml(
    page(`<main><h1>Our team</h1><p>Visible team introduction.</p><div style="display:none"><h3>Retired Staffer</h3><p>Former Analyst</p></div></main>`),
  );
  expect(capture.text).toContain("Visible team introduction.");
  expect(capture.text).not.toContain("Retired Staffer");
  expect(capture.text).not.toContain("Former Analyst");
});

it("keeps a div with the hidden attribute out of captured text", () => {
  const capture = captureHtml(
    page(`<main><h1>Our team</h1><p>Visible team introduction.</p><div hidden><h3>Draft Entry</h3><p>Pending Designer</p></div></main>`),
  );
  expect(capture.text).toContain("Visible team introduction.");
  expect(capture.text).not.toContain("Draft Entry");
  expect(capture.text).not.toContain("Pending Designer");
});
