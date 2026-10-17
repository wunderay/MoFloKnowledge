// Acceptance, Quest Q21 viewer-polish, item 1: the inline textarea opens tall enough for its value.
// rows = max(3, number of lines of the value), capped at 12.
import { describe, expect, it, vi } from "vitest";
import { OVERVIEW_F, draftWith, open, setAt, startEdit } from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });

const lines = (n: number) => Array.from({ length: n }, (_, i) => `Line ${i + 1}`).join("\n");

async function rowsFor(value: string): Promise<number> {
  const draft = draftWith((b) => setAt(b.company_foundation, OVERVIEW_F.path, value));
  const view = await open(OVERVIEW_F.section, { draft });
  const area = await startEdit(view, OVERVIEW_F);
  return Number(area.props.rows);
}

describe("Q21 textarea rows", () => {
  it("a short value still opens 3 rows", async () => {
    expect(await rowsFor("One line.")).toBe(3);
  });
  it("a 7-line value opens 7 rows", async () => {
    expect(await rowsFor(lines(7))).toBe(7);
  });
  it("a very long value is capped at 12 rows", async () => {
    expect(await rowsFor(lines(40))).toBe(12);
  });
});
