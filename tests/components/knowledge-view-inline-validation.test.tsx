// Acceptance, Quest Q7 inline-edit-core, C4: the contracts' rules are enforced in the page, with a clear inline message.
//
// An invalid value never reaches the API (no request at all), the editor stays open with the typed text so nothing is
// lost, and the reason is a role=alert element next to the field (never a console message, never a silent drop).
//  - Founded: a four-digit year, not after the current year. Message names the "4-digit year".
//  - Employees: a whole number, 0 or more; saved as the exact count. Messages say "whole number" / "negative".
//  - every text value: at most 20,000 characters (MAX_TEXT_LENGTH).
// DECISION: no field of the three sections holds a URL in Q7 (social links, channels, calls to action and suppliers
// are objects and out of scope), so the URL rule is not locked here; it belongs to the Quest that edits those lists.
// DECISION: Employees is edited as the exact count; the saved employee_count has exact = n, min = max = null,
// as_of kept, and a non-empty raw text containing n.
import { describe, expect, it, vi } from "vitest";
import {
  EMPLOYEES,
  FOUNDED,
  LEGAL,
  OVERVIEW_F,
  alertText,
  alerts,
  blur,
  click,
  draftWith,
  editAndEnter,
  editButton,
  editButtons,
  key,
  long,
  nothingSent,
  open,
  revisionWrite,
  startEdit,
  statusText,
  stored,
  textboxes,
  thisYear,
  type,
  valueOf,
  withField,
  buttonNamed,
} from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });

describe("C4 Founded is a four-digit year", () => {
  it("shows the year as an 'Edit Founded' button and saves a valid year as a number", async () => {
    const view = await open(FOUNDED.section);
    const before = stored(view, FOUNDED.kind);
    expect(view.text(editButton(view, "Founded"))).toContain("2014");
    expect(editButton(view, "Founded").props.title).toBe("Click to edit");
    await editAndEnter(view, FOUNDED, "2015");
    const { content } = revisionWrite(view, before);
    expect(content.year_founded, "a number, not text").toBe(2015);
    expect(content).toEqual(withField(before, ["year_founded"], 2015));
    expect(view.text(editButton(view, "Founded"))).toContain("2015");
  });

  it.each(["20x4", "99", "999", "12345", "abc"])("rejects %j inline, sends nothing, and keeps the typed text", async (typed) => {
    const view = await open(FOUNDED.section);
    const input = await editAndEnter(view, FOUNDED, typed);
    expect(alertText(view), "an inline reason that names the rule").toMatch(/\b(4|four)[- ]digit\b/i);
    nothingSent(view);
    expect(textboxes(view, "Founded"), "the editor stays open").toHaveLength(1);
    expect(valueOf(view, input), "the typed text is still there").toBe(typed);
    expect(statusText(view)).not.toMatch(/saved/i);
  });

  it("rejects a year after the current one", async () => {
    const view = await open(FOUNDED.section);
    await editAndEnter(view, FOUNDED, String(thisYear() + 1));
    expect(alertText(view)).toMatch(/year/i);
    nothingSent(view);
  });

  it("accepts the current year and an old four-digit year", async () => {
    for (const year of [thisYear(), 1850]) {
      const view = await open(FOUNDED.section);
      const before = stored(view, FOUNDED.kind);
      await editAndEnter(view, FOUNDED, String(year));
      expect(revisionWrite(view, before).content.year_founded).toBe(year);
      expect(alerts(view)).toHaveLength(0);
    }
  });

  it("the message goes once the text is corrected, and the corrected year is saved", async () => {
    const view = await open(FOUNDED.section);
    const before = stored(view, FOUNDED.kind);
    const input = await editAndEnter(view, FOUNDED, "20x4");
    expect(alerts(view)).toHaveLength(1);
    await type(view, input, "2016");
    await key(view, input, "Enter");
    await view.settle();
    expect(alerts(view)).toHaveLength(0);
    expect(view.server.writes, "only the corrected value was sent").toHaveLength(1);
    expect(revisionWrite(view, before).content.year_founded).toBe(2016);
  });

  it("blur with an invalid year keeps the editor open with the message and sends nothing", async () => {
    const view = await open(FOUNDED.section);
    const input = await startEdit(view, FOUNDED);
    await type(view, input, "19x9");
    await blur(view, input);
    await view.settle();
    expect(alertText(view)).toMatch(/\b(4|four)[- ]digit\b/i);
    expect(textboxes(view, "Founded")).toHaveLength(1);
    nothingSent(view);
  });

  it("Escape drops the invalid text and the message, and restores the year", async () => {
    const view = await open(FOUNDED.section);
    const input = await editAndEnter(view, FOUNDED, "oops");
    await key(view, input, "Escape");
    expect(alerts(view)).toHaveLength(0);
    expect(view.text(editButton(view, "Founded"))).toContain("2014");
    nothingSent(view);
  });

  it("an empty Founded is editable; emptying a year saves null", async () => {
    const empty = draftWith((b) => {
      b.company_foundation.year_founded = null;
    });
    const view = await open(FOUNDED.section, { draft: empty });
    expect(editButtons(view, "Founded")).toHaveLength(1);
    const before = stored(view, FOUNDED.kind);
    await editAndEnter(view, FOUNDED, "2001");
    expect(revisionWrite(view, before).content.year_founded).toBe(2001);

    const filled = await open(FOUNDED.section);
    const filledBefore = stored(filled, FOUNDED.kind);
    await editAndEnter(filled, FOUNDED, "");
    expect(revisionWrite(filled, filledBefore).content.year_founded).toBeNull();
  });
});

describe("C4 Employees is a count of 0 or more", () => {
  it("shows the count as an 'Edit Employees' button and saves a whole number as the exact count", async () => {
    const view = await open(EMPLOYEES.section);
    const before = stored(view, EMPLOYEES.kind);
    expect(view.text(editButton(view, "Employees"))).toContain("38");
    const input = await startEdit(view, EMPLOYEES);
    expect(valueOf(view, input), "the field starts from the current count").toContain("38");
    await type(view, input, "40");
    await key(view, input, "Enter");
    await view.settle();
    const { content } = revisionWrite(view, before);
    expect(content.employee_count).toMatchObject({ exact: 40, min: null, max: null, as_of: "2026-03-01" });
    expect(content.employee_count.raw).toMatch(/40/);
    expect(content).toEqual({ ...before.content, employee_count: content.employee_count });
    expect(view.text(editButton(view, "Employees"))).toContain("40");
  });

  it("zero is a valid count", async () => {
    const view = await open(EMPLOYEES.section);
    const before = stored(view, EMPLOYEES.kind);
    await editAndEnter(view, EMPLOYEES, "0");
    expect(revisionWrite(view, before).content.employee_count).toMatchObject({ exact: 0, min: null, max: null });
  });

  it.each([
    ["-5", /negative|0 or more|at least 0/i],
    ["12.5", /whole number/i],
    ["many", /whole number/i],
  ])("rejects %j inline with a reason and sends nothing", async (typed, reason) => {
    const view = await open(EMPLOYEES.section);
    const input = await editAndEnter(view, EMPLOYEES, typed);
    expect(alertText(view)).toMatch(reason);
    nothingSent(view);
    expect(textboxes(view, "Employees")).toHaveLength(1);
    expect(valueOf(view, input)).toBe(typed);
  });

  it("a stored range is replaced by an exact count when a number is typed", async () => {
    const draft = draftWith((b) => {
      b.company_foundation.employee_count = { raw: "50-100 employees", exact: null, min: 50, max: 100, as_of: null };
    });
    const view = await open(EMPLOYEES.section, { draft });
    const before = stored(view, EMPLOYEES.kind);
    expect(view.text(editButton(view, "Employees"))).toContain("50");
    await editAndEnter(view, EMPLOYEES, "75");
    expect(revisionWrite(view, before).content.employee_count).toMatchObject({ exact: 75, min: null, max: null, as_of: null });
  });

  it("an empty Employees is editable; emptying a count saves null", async () => {
    const draft = draftWith((b) => {
      b.company_foundation.employee_count = null;
    });
    const view = await open(EMPLOYEES.section, { draft });
    const before = stored(view, EMPLOYEES.kind);
    await editAndEnter(view, EMPLOYEES, "12");
    expect(revisionWrite(view, before).content.employee_count).toMatchObject({ exact: 12, min: null, max: null, as_of: null });

    const filled = await open(EMPLOYEES.section);
    const filledBefore = stored(filled, EMPLOYEES.kind);
    await editAndEnter(filled, EMPLOYEES, "");
    expect(revisionWrite(filled, filledBefore).content.employee_count).toBeNull();
  });
});

describe("C4 text length (20,000 characters)", () => {
  it("a single-line value of 20,001 characters is refused inline; 20,000 is saved", async () => {
    const view = await open(LEGAL.section);
    const before = stored(view, LEGAL.kind);
    const input = await editAndEnter(view, LEGAL, long(20_001));
    expect(alertText(view)).toMatch(/20,?000/);
    nothingSent(view);
    expect(textboxes(view, LEGAL.label)).toHaveLength(1);
    await type(view, input, long(20_000));
    await key(view, input, "Enter");
    await view.settle();
    expect(view.server.writes).toHaveLength(1);
    expect(revisionWrite(view, before).content.legal_entity_type).toHaveLength(20_000);
  });

  it("a multi-line value of 20,001 characters is refused inline with Save and with Enter", async () => {
    const view = await open(OVERVIEW_F.section);
    const area = await startEdit(view, OVERVIEW_F);
    await type(view, area, long(20_001));
    await key(view, area, "Enter");
    expect(alertText(view)).toMatch(/20,?000/);
    const save = buttonNamed(view, /^save\b/i);
    if (save) {
      await click(view, save);
    }
    nothingSent(view);
    expect(textboxes(view, OVERVIEW_F.label), "the text is kept").toHaveLength(1);
  });
});
