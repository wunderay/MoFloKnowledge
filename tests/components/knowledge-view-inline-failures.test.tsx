// Stale revisions, failed requests and a failed re-read after a committed save.
//
//  - 409 (the entry changed since the page loaded): a role=alert message that asks the person to reload, the typed
//    text (or the listed item) stays where it is; nothing is replaced silently, no "Saved".
//  - any other failure: a role=alert message with the server's own message, and a "Retry" button. Retry sends the SAME
//    request again (same requestId, same revision, same content), so a save that did commit is not applied twice.
//  - a save that committed whose re-read of the draft failed: the existing notice "Saved. Reload…" with its Reload
//    button; the save is NOT sent again, no failure message or Retry is shown for it, and editing is switched off
//    (edit buttons, Add and Remove are disabled) until a Reload succeeds. Then the new value shows and the next save
//    carries the new revision.
import { describe, expect, it, vi } from "vitest";
import { buildEmptyDraft } from "../helpers/knowledge-view-fixtures";
import {
  BUYERS,
  LEGAL,
  OVERVIEW_F,
  STORY,
  addChip,
  addInputs,
  addPill,
  alertText,
  alerts,
  chipInput,
  click,
  disabled,
  editAndEnter,
  editButton,
  failDraftReadsAfterWrite,
  getAt,
  itemsOf,
  key,
  one,
  open,
  removeButtons,
  removeChip,
  revisionWrite,
  startEdit,
  statusText,
  stored,
  textboxes,
  type,
  undoButtons,
  valueOf,
  withField,
  type TextField,
} from "../helpers/knowledge-view-inline-edit";
import type { View } from "../helpers/knowledge-view-site-all-runtime";

vi.setConfig({ testTimeout: 60_000 });

const staleServerEntry = (view: View, kind: string) => {
  const entry = (view.server.draft.entries as any[]).find((e) => e.kind === kind);
  entry.revision = entry.current_revision = entry.current_revision + 7;
};
async function submit(view: View, field: TextField, text: string) {
  if (field.shape === "single") {
    return editAndEnter(view, field, text);
  }
  const area = await startEdit(view, field);
  await type(view, area, text);
  await key(view, area, "Enter");
  await view.settle();
  return area;
}

describe("a stale revision (409)", () => {
  it.each([LEGAL, OVERVIEW_F])("$label: asks to reload, keeps the typed text, shows no 'Saved'", async (field) => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    staleServerEntry(view, field.kind);
    await submit(view, field, "Typed against an old revision");
    expect(alertText(view)).toMatch(/reload/i);
    expect(view.server.writes, "one attempt, not retried on its own").toHaveLength(1);
    expect(view.server.writes[0].body.expectedRevision).toBe(before.current_revision);
    const field$ = textboxes(view, field.label);
    expect(field$, "the editor is still open").toHaveLength(1);
    expect(valueOf(view, field$[0]), "the typed text is kept").toBe("Typed against an old revision");
    expect(statusText(view)).not.toMatch(/✓\s*Saved/);
  });

  it("adding an item: asks to reload and keeps the typed text", async () => {
    const view = await open(BUYERS.section);
    staleServerEntry(view, BUYERS.kind);
    const input = await chipInput(view, BUYERS);
    await type(view, input, "Wine bars");
    await key(view, input, "Enter");
    await view.settle();
    expect(alertText(view)).toMatch(/reload/i);
    expect(valueOf(view, one(view.byRole("textbox", /add buyer/i), "the add field"))).toBe("Wine bars");
    expect(removeButtons(view, "Wine bars"), "not listed as if it were saved").toHaveLength(0);
  });

  it("removing an item: the item stays listed, with a message to reload and no Undo", async () => {
    const view = await open(BUYERS.section);
    const target = itemsOf(stored(view, BUYERS.kind), BUYERS.path)[0];
    staleServerEntry(view, BUYERS.kind);
    await removeChip(view, target.text);
    expect(alertText(view)).toMatch(/reload/i);
    expect(removeButtons(view, target.text), "still listed").toHaveLength(1);
    expect(undoButtons(view), "nothing was removed, so nothing to undo").toHaveLength(0);
    expect(view.server.writes).toHaveLength(1);
  });
});

describe("a failed request shows the server's message and a Retry that repeats the same request", () => {
  it.each([
    { field: LEGAL, status: 503, message: "Draft store is down." },
    { field: OVERVIEW_F, status: 500, message: "Something broke on the server." },
    { field: STORY, status: 422, message: "The story could not be accepted." },
  ])("$field.label ($status)", async ({ field, status, message }) => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    view.server.writeFailure = { status, message };
    await submit(view, field, "Will need a retry");
    expect(alertText(view), "the server's message, verbatim").toContain(message);
    expect(textboxes(view, field.label), "the text is kept in the open editor").toHaveLength(1);
    expect(valueOf(view, textboxes(view, field.label)[0])).toBe("Will need a retry");
    const retry = one(view.byRole("button", /^retry$/i), 'a "Retry" button');
    expect(statusText(view)).not.toMatch(/✓\s*Saved/);

    // still failing: the message stays, same request again
    await click(view, retry);
    expect(alertText(view)).toContain(message);
    expect(view.server.writes).toHaveLength(2);

    view.server.writeFailure = null;
    await click(view, one(view.byRole("button", /^retry$/i), "Retry still offered"));
    expect(view.server.writes).toHaveLength(3);
    const [first, , third] = view.server.writes;
    expect(third.body.requestId, "the same request id, so a committed save is not applied twice").toBe(first.body.requestId);
    expect(third.body.expectedRevision).toBe(first.body.expectedRevision);
    expect(third.body.content).toEqual(first.body.content);
    expect(revisionWrite(view, before, 2, before.current_revision).content).toEqual(withField(before, field.path, "Will need a retry"));
    expect(statusText(view)).toMatch(/✓\s*Saved/);
    expect(alerts(view), "the message goes after a good save").toHaveLength(0);
    expect(view.byRole("button", /^retry$/i), "no Retry after success").toHaveLength(0);
    expect(view.text(editButton(view, field.label))).toContain("Will need a retry");
  });

  it("Escape leaves a failed edit: the message goes and the saved value is back", async () => {
    const view = await open(LEGAL.section);
    view.server.writeFailure = { status: 503, message: "Draft store is down." };
    const input = await editAndEnter(view, LEGAL, "Abandoned after failure");
    expect(alerts(view)).toHaveLength(1);
    await key(view, input, "Escape");
    expect(alerts(view)).toHaveLength(0);
    expect(view.byRole("button", /^retry$/i)).toHaveLength(0);
    expect(view.text(editButton(view, LEGAL.label))).not.toContain("Abandoned after failure");
  });

  it("a failed add keeps the typed text with a Retry; the retry adds the item once", async () => {
    const view = await open(BUYERS.section);
    const before = stored(view, BUYERS.kind);
    view.server.writeFailure = { status: 503, message: "Draft store is down." };
    const input = await chipInput(view, BUYERS);
    await type(view, input, "Caterers");
    await key(view, input, "Enter");
    await view.settle();
    expect(alertText(view)).toContain("Draft store is down.");
    expect(removeButtons(view, "Caterers")).toHaveLength(0);
    view.server.writeFailure = null;
    await click(view, one(view.byRole("button", /^retry$/i), "Retry"));
    expect(view.server.writes).toHaveLength(2);
    expect(view.server.writes[1].body.requestId).toBe(view.server.writes[0].body.requestId);
    expect((getAt(revisionWrite(view, before, 1, before.current_revision).content, BUYERS.path) as { text: string }[]).map((i) => i.text)).toContain("Caterers");
    expect(removeButtons(view, "Caterers")).toHaveLength(1);
  });

  it("a failed remove keeps the item listed with a Retry", async () => {
    const view = await open(BUYERS.section);
    const target = itemsOf(stored(view, BUYERS.kind), BUYERS.path)[0];
    view.server.writeFailure = { status: 503, message: "Draft store is down." };
    await removeChip(view, target.text);
    expect(alertText(view)).toContain("Draft store is down.");
    expect(removeButtons(view, target.text)).toHaveLength(1);
    view.server.writeFailure = null;
    await click(view, one(view.byRole("button", /^retry$/i), "Retry"));
    expect(removeButtons(view, target.text)).toHaveLength(0);
    expect(view.server.writes).toHaveLength(2);
  });
});

describe("a committed save whose re-read of the draft fails", () => {
  const allEditors = (view: View) => view.byRole("button", /^edit /i);

  it.each([LEGAL, OVERVIEW_F])("$label: says it was saved, offers Reload, never resends, and switches editing off until a Reload works", async (field) => {
    let control!: { recover: () => void };
    const view = await open(field.section, { server: (s) => (control = failDraftReadsAfterWrite(s)) });
    const before = stored(view, field.kind);
    await submit(view, field, "Committed value");
    expect(view.server.writes, "exactly one committed write").toHaveLength(1);
    expect(view.text(), "the existing recovery notice").toMatch(/saved\. reload/i);
    expect(view.byRole("button", /^retry$/i), "a save that went through is not retried").toHaveLength(0);
    expect(alerts(view).map((a) => view.text(a)).join(" "), "no failure message for a save that committed").not.toMatch(/draft store is down/i);

    // editing is off: every edit button is disabled and does nothing
    const buttons = allEditors(view);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(disabled(view, button), `${view.nameOf(button)} is disabled`).toBe(true);
    }
    await click(view, buttons[0]);
    expect(textboxes(view, field.label), "no editor opens on stale data").toHaveLength(0);
    expect(view.server.writes, "no second write").toHaveLength(1);

    // Reload while the read still fails: still stale, still one write
    const reload = () => one(view.byRole("button", /^reload$/i), 'a "Reload" button');
    await click(view, reload());
    expect(view.text()).toMatch(/saved\. reload/i);
    expect(view.server.writes).toHaveLength(1);

    // the read recovers
    control.recover();
    await click(view, reload());
    expect(view.text()).not.toMatch(/saved\. reload/i);
    expect(view.text(editButton(view, field.label))).toContain("Committed value");
    expect(disabled(view, editButton(view, field.label))).toBe(false);

    // and the next save carries the new revision
    await submit(view, field, "Second value");
    expect(view.server.writes).toHaveLength(2);
    expect(revisionWrite(view, before, 1, before.current_revision + 1).content).toEqual(withField(before, field.path, "Second value"));
  });

  it("a creation: the first entry is not created twice; Reload then lets the next edit revise it", async () => {
    let control!: { recover: () => void };
    const view = await open("General Info", { draft: buildEmptyDraft(), server: (s) => (control = failDraftReadsAfterWrite(s)) });
    await submit(view, OVERVIEW_F, "First overview");
    expect(view.server.writesTo("entries"), "one creation").toHaveLength(1);
    expect(view.text()).toMatch(/saved\. reload/i);
    for (const button of allEditors(view)) {
      expect(disabled(view, button)).toBe(true);
    }
    await click(view, allEditors(view)[0]);
    expect(view.server.writes, "nothing is created a second time").toHaveLength(1);
    control.recover();
    await click(view, one(view.byRole("button", /^reload$/i), "Reload"));
    expect(view.text(editButton(view, OVERVIEW_F.label))).toContain("First overview");
    await submit(view, OVERVIEW_F, "Second overview");
    expect(view.server.writesTo("entries")).toHaveLength(1);
    expect(view.server.writesTo("revisions")).toHaveLength(1);
    expect(view.server.writes[1].body.expectedRevision).toBe(1);
  });

  it("an added item: one write, Add and Remove are disabled until Reload works", async () => {
    let control!: { recover: () => void };
    const view = await open(BUYERS.section, { server: (s) => (control = failDraftReadsAfterWrite(s)) });
    const items = itemsOf(stored(view, BUYERS.kind), BUYERS.path);
    await addChip(view, BUYERS, "Late buyer");
    expect(view.server.writes).toHaveLength(1);
    expect(view.text()).toMatch(/saved\. reload/i);
    expect(view.byRole("button", /^retry$/i)).toHaveLength(0);
    for (const pill of addPill(view, BUYERS)) {
      expect(disabled(view, pill), "Add buyer is disabled").toBe(true);
    }
    for (const input of addInputs(view, BUYERS)) {
      expect(disabled(view, input) || input.props.readOnly === true, "an add field left open is switched off").toBe(true);
    }
    for (const item of items) {
      for (const remove of removeButtons(view, item.text)) {
        expect(disabled(view, remove), `Remove ${item.text} is disabled`).toBe(true);
      }
    }
    await click(view, one(removeButtons(view, items[0].text), "remove"));
    expect(view.server.writes, "a disabled Remove sends nothing").toHaveLength(1);
    control.recover();
    await click(view, one(view.byRole("button", /^reload$/i), "Reload"));
    expect(removeButtons(view, "Late buyer")).toHaveLength(1);
    const pill = addPill(view, BUYERS)[0];
    const field = addInputs(view, BUYERS)[0];
    expect(pill ?? field, "the list can be added to again").toBeDefined();
    if (pill) {
      expect(disabled(view, pill)).toBe(false);
    }
    if (field) {
      expect(disabled(view, field) || field.props.readOnly === true).toBe(false);
    }
  });
});
