// The knowledge view lists captured FAQ answers and contact details in a
// read-only "Captured from the website" section, each with a link to its source.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderViewPage } from "../helpers/knowledge-view-render";
import { VERSIONS, buildDraft } from "../helpers/knowledge-view-fixtures";

const SOURCE = "https://www.harborandpine.example/contact";
const modulePath = "@/server/captured-extras";

beforeAll(() => {
  vi.doMock(modulePath, () => ({
    readCapturedExtras: async () => ({
      faqs: [{ question: "Do you ship internationally?", answer: "We ship to Canada and the UK.", sources: [SOURCE] }],
      contacts: [{ kind: "email", value: "hello@harborandpine.example", sources: [SOURCE] }],
    }),
  }));
});

describe("captured extras on the knowledge view", () => {
  it("shows a Captured from the website section with an FAQ, an email and a source link", async () => {
    const html = await renderViewPage({ draft: buildDraft(), versions: VERSIONS, section: "all" });
    expect(html.includes("Captured from the website"), "section heading renders").toBe(true);
    expect(html.includes("Do you ship internationally?"), "FAQ question renders").toBe(true);
    expect(html.includes("hello@harborandpine.example"), "email renders").toBe(true);
    expect(new RegExp(`<a[^>]*href="${SOURCE}"`).test(html), "source link renders").toBe(true);
  });
});
