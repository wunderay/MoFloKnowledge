// The knowledge view shows captured headlines, calls to action, lead magnets and
// opening hours as sub-sections of the "Captured from the website" area.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderViewPage } from "../helpers/knowledge-view-render";
import { VERSIONS, buildDraft } from "../helpers/knowledge-view-fixtures";

const SOURCE = "https://www.harborandpine.example/";
const HEADLINE = "Small-batch coffee, roasted to order";
const modulePath = "@/server/captured-hooks";

beforeAll(() => {
  vi.doMock(modulePath, () => ({
    readCapturedHooks: async () => ({
      headlines: [{ text: HEADLINE, level: 1, sources: [SOURCE] }],
      ctas: [],
      leadMagnets: [],
      hours: [],
    }),
  }));
});

describe("captured hooks on the knowledge view", () => {
  it("shows a Headlines sub-section inside Captured from the website, with one headline", async () => {
    const html = await renderViewPage({ draft: buildDraft(), versions: VERSIONS, section: "all" });
    const captured = html.indexOf("Captured from the website");
    expect(captured, "captured section renders").toBeGreaterThanOrEqual(0);
    const heading = /<h[2-6][^>]*>Headlines<\/h[2-6]>/.exec(html);
    expect(heading, "Headlines sub-section heading renders").not.toBeNull();
    expect(heading!.index > captured, "Headlines sub-section sits inside the captured section").toBe(true);
    expect(html.includes(HEADLINE), "headline item renders").toBe(true);
  });
});
