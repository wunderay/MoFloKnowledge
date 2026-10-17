// Acceptance, Quest Q21 viewer-polish, item 2: Key People detail shows a read-only Role under Position,
// and the paired fields do not stretch to the tallest one.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openPeople } from "../helpers/knowledge-view-people-render";
import { peopleDraft } from "../helpers/knowledge-view-people-fixtures";
import { norm } from "../helpers/knowledge-view-dom";

describe("Q21 key people polish", () => {
  it("shows the person's role as a Role field after Position and before Age", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const text = norm(page.$('section[aria-label^="Details of"]').first().text());
    const role = text.indexOf("Role");
    expect(role, "a Role label").toBeGreaterThan(-1);
    expect(text).toContain("Leads sourcing and strategy.");
    expect(text.indexOf("Position")).toBeLessThan(role);
    expect(role).toBeLessThan(text.indexOf("Age"));
    expect(role).toBeLessThan(text.indexOf("Leads sourcing and strategy."));
  });

  it("the Role is read-only (no text field for it)", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    expect(page.$('section[aria-label^="Details of"] input:not([type=file]), section[aria-label^="Details of"] textarea').length).toBe(0);
  });

  it("the paired-fields grid aligns items to the start", () => {
    const css = readFileSync("src/components/knowledge-view/knowledge-view.css", "utf8");
    const rule = /\.knowledge-view__field-pair\s*\{([^}]*)\}/.exec(css);
    expect(rule, "a .knowledge-view__field-pair rule").not.toBeNull();
    expect(rule![1]).toMatch(/align-items:\s*start/);
  });
});
