// Acceptance: Key People interactions (selection by click, create, delete,
// portrait upload). The REAL page and client components run in the interactive runtime
// (knowledge-view-site-all-runtime) against an in-memory fake of the company API that records every
// request. Request bodies are checked against the product's own API contracts.
//
// No delete route exists on main: the UI must send
//   DELETE /api/companies/<companyId>/entries/<entryId>  with JSON { expectedRevision, requestId }
// and the fake answers it here.
import { describe, expect, it } from "vitest";
// The runtime registers its react / next mocks when imported, so it comes before the helpers that use it.
import { clearNavigations, focusedPath, navigations, descendants } from "../helpers/knowledge-view-site-all-runtime";
import { CreateEntrySchema, SaveEntrySchema } from "../../src/contracts/api-entries";
import { COMPANY_ID } from "../helpers/knowledge-view-fixtures";
import { detailGroup, groupText, headingCount, peopleRows, showsInitials, type Label } from "../helpers/knowledge-view-people-dom";
import {
  MAYA,
  PERSON_IDS,
  PORTRAIT_URL,
  PRIYA,
  TOMAS,
  noPeopleDraft,
  peopleDraft,
} from "../helpers/knowledge-view-people-fixtures";
import {
  addPersonButton,
  buttons,
  chooseFile,
  deleteButtons,
  fileInput,
  focusedName,
  need,
  openKeyPeople,
  png,
  rowNodes,
  rowTarget,
  rowTexts,
} from "../helpers/knowledge-view-people-driver";
import type { View } from "../helpers/knowledge-view-site-all-runtime";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECTED = ["aria-current", "aria-selected", "aria-pressed", "aria-checked", "data-selected", "data-active"];
const selectedRows = (view: View) =>
  rowNodes(view)
    .map((row, i) => ([row, ...descendants(row)].some((n) => SELECTED.some((a) => n.props[a] !== undefined && n.props[a] !== false && n.props[a] !== "false" && n.props[a] !== "")) ? i : -1))
    .filter((i) => i >= 0);
const shown = (view: View, label: Label) => {
  const page = view.page();
  expect(detailGroup(page, label), `the detail shows a "${label}" card/label`).not.toBeNull();
  return groupText(page, label);
};
const count = (view: View) => headingCount(view.page()).count;
const lastPerson = () => {
  const urls = navigations().filter((u) => u.includes("person="));
  const last = urls[urls.length - 1];
  return last ? new URL(last, "http://localhost/knowledge/view").searchParams.get("person") : null;
};
const company = `/api/companies/${COMPANY_ID}`;

async function selectRow(view: View, index: number) {
  const row = need(rowNodes(view)[index], `row ${index + 1}`);
  await view.click(rowTarget(view, row));
  await view.settle(5);
}

describe("selecting a person by click", () => {
  it("clicking a person selects it, shows its detail and puts ?person=<entry id> in the URL", async () => {
    const { view } = await openKeyPeople({ draft: peopleDraft() });
    expect(rowNodes(view)).toHaveLength(4);
    expect(selectedRows(view)).toEqual([0]);
    clearNavigations();
    await selectRow(view, 1);
    expect(selectedRows(view)).toEqual([1]);
    expect(shown(view, "Name")).toContain(TOMAS.name);
    expect(lastPerson()).toBe(PERSON_IDS[1]);
    await selectRow(view, 2);
    expect(selectedRows(view)).toEqual([2]);
    expect(shown(view, "Name")).toContain(PRIYA.name);
    expect(lastPerson()).toBe(PERSON_IDS[2]);
  });

  it("selecting does not write anything", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft() });
    await selectRow(view, 1);
    expect(rowNodes(view)).toHaveLength(4);
    expect(server.writes).toEqual([]);
  });
});

describe("create a person", () => {
  it("'Add person' creates a key_person entry named 'Untitled person' through the entries API", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft() });
    const add = need(addPersonButton(view), 'a button named "Add person"');
    await view.click(add);
    await view.settle(8);
    const posts = server.writesTo("entries");
    expect(posts, "one POST to /api/companies/<id>/entries").toHaveLength(1);
    expect(posts[0].path).toBe(`${company}/entries`);
    const body = CreateEntrySchema.parse(posts[0].body);
    expect(body.kind).toBe("key_person");
    expect(body.content).toMatchObject({ name: "Untitled person", title: null, role: null, gender: null, background_or_relevance: null, age: null, nationality: null, portrait: null });
    expect((body.content as { id: string }).id).toMatch(UUID);
    expect(body.requestId).toMatch(UUID);
    expect(server.writes).toHaveLength(1);
  });

  it("the new person is listed last, counted, selected (in the URL too) and focused", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft() });
    clearNavigations();
    await view.click(need(addPersonButton(view), 'a button named "Add person"'));
    await view.settle(8);
    const created = server.writesTo("entries")[0].body.content.id as string;
    expect(rowNodes(view)).toHaveLength(5);
    expect(count(view)).toBe(5);
    expect(rowTexts(view)[4]).toContain("Untitled person");
    expect(selectedRows(view)).toEqual([4]);
    expect(shown(view, "Name")).toContain("Untitled person");
    expect(lastPerson()).toBe(created);
    expect(focusedName(view), "focus moves to the new person (its row or its detail)").toContain("Untitled person");
  });

  it("Edge case: it works for a company with no people yet", async () => {
    const { view, server } = await openKeyPeople({ draft: noPeopleDraft() });
    expect(rowNodes(view)).toHaveLength(0);
    await view.click(need(addPersonButton(view), "Add person is offered even with no people"));
    await view.settle(8);
    expect(server.writesTo("entries")).toHaveLength(1);
    expect(rowNodes(view)).toHaveLength(1);
    expect(count(view)).toBe(1);
    expect(selectedRows(view)).toEqual([0]);
  });

  it("Edge case: pressing 'Add person' twice while the first request is pending creates one person", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft(), configure: (s) => s.hold() });
    const add = need(addPersonButton(view), 'a button named "Add person"');
    await view.click(add);
    await view.settle(3);
    await view.click(view.fresh(add) ?? add);
    await view.settle(3);
    server.release();
    await view.settle(8);
    expect(server.writesTo("entries")).toHaveLength(1);
    expect(rowNodes(view)).toHaveLength(5);
  });

  it("Edge case: when the server refuses, the people are unchanged and its message is shown", async () => {
    const { view, server } = await openKeyPeople({
      draft: peopleDraft(),
      configure: (s) => void (s.writeFailure = { status: 503, message: "Saving is unavailable right now." }),
    });
    clearNavigations();
    await view.click(need(addPersonButton(view), 'a button named "Add person"'));
    await view.settle(8);
    expect(server.writesTo("entries")).toHaveLength(1);
    expect(rowNodes(view)).toHaveLength(4);
    expect(count(view)).toBe(4);
    expect(view.text()).toContain("Saving is unavailable right now.");
    expect(lastPerson()).toBeNull();
  });
});

describe("delete a person", () => {
  const dialogOf = (view: View) => view.dialogs()[0] ?? null;

  async function askToDelete(view: View) {
    const button = need(deleteButtons(view)[0], 'a button named "Delete ..." for the selected person');
    await view.click(button);
    await view.settle(5);
    return button;
  }

  it("'Delete' opens a confirmation dialog named for the person, with Cancel and Delete, and sends nothing yet", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft() });
    await askToDelete(view);
    const dialog = need(dialogOf(view), "a dialog or alertdialog is open");
    const name = view.nameOf(dialog);
    expect(name, "the dialog has an accessible name").toMatch(/delete/i);
    expect(name + view.text(dialog)).toContain(MAYA.name);
    expect(buttons(view, /^cancel$/i, dialog)).toHaveLength(1);
    expect(buttons(view, /^delete( person)?$/i, dialog)).toHaveLength(1);
    expect(view.focusMovedInto(dialog), "focus moves into the dialog").toBe(true);
    expect(server.writes).toEqual([]);
    expect(rowNodes(view)).toHaveLength(4);
  });

  it("Cancel closes the dialog, deletes nothing, and returns focus to the Delete button", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft() });
    const opener = await askToDelete(view);
    const dialog = need(dialogOf(view), "a dialog is open");
    await view.click(need(buttons(view, /^cancel$/i, dialog)[0], "Cancel"));
    await view.settle(5);
    expect(dialogOf(view)).toBeNull();
    expect(server.writes).toEqual([]);
    expect(rowNodes(view)).toHaveLength(4);
    expect(focusedPath(), "focus returns to the control that opened the dialog").toBe(opener.path);
  });

  it("Escape cancels: the dialog closes, nothing is deleted, focus returns to the Delete button", async () => {
    const { view, server } = await openKeyPeople({ draft: peopleDraft() });
    const opener = await askToDelete(view);
    await view.press(need(dialogOf(view), "a dialog is open"), "Escape");
    await view.settle(5);
    expect(dialogOf(view)).toBeNull();
    expect(server.writes).toEqual([]);
    expect(rowNodes(view)).toHaveLength(4);
    expect(focusedPath()).toBe(opener.path);
  });

  it("confirming sends DELETE with the person's current revision, removes them and selects the first remaining person", async () => {
    const { view, api, server } = await openKeyPeople({ draft: peopleDraft() });
    clearNavigations();
    await askToDelete(view);
    const dialog = need(dialogOf(view), "a dialog is open");
    await view.click(need(buttons(view, /^delete( person)?$/i, dialog)[0], "the dialog's Delete button"));
    await view.settle(8);
    expect(api.deletes, "one DELETE request").toHaveLength(1);
    expect(server.requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
    expect(api.deletes[0].path).toBe(`${company}/entries/${PERSON_IDS[0]}`);
    expect(api.deletes[0].body.expectedRevision).toBe(2);
    expect(api.deletes[0].body.requestId).toMatch(UUID);
    expect(dialogOf(view)).toBeNull();
    expect(rowNodes(view)).toHaveLength(3);
    expect(count(view)).toBe(3);
    expect(rowTexts(view).join(" ")).not.toContain(MAYA.name);
    expect(selectedRows(view)).toEqual([0]);
    expect(shown(view, "Name")).toContain(TOMAS.name);
  });

  it("deleting a person selected by click removes that person, not the first", async () => {
    const { view, api } = await openKeyPeople({ draft: peopleDraft() });
    await selectRow(view, 2);
    await askToDelete(view);
    const dialog = need(dialogOf(view), "a dialog is open");
    expect(view.nameOf(dialog) + view.text(dialog)).toContain(PRIYA.name);
    await view.click(need(buttons(view, /^delete( person)?$/i, dialog)[0], "the dialog's Delete button"));
    await view.settle(8);
    expect(api.deletes.map((d) => d.path)).toEqual([`${company}/entries/${PERSON_IDS[2]}`]);
    expect(rowNodes(view)).toHaveLength(3);
    expect(rowTexts(view).join(" ")).not.toContain(PRIYA.name);
    expect(rowTexts(view).join(" ")).toContain(MAYA.name);
  });

  it("Edge case: deleting the only person leaves the empty state with the count at 0", async () => {
    const { view } = await openKeyPeople({ draft: peopleDraft([MAYA]) });
    await askToDelete(view);
    await view.click(need(buttons(view, /^delete( person)?$/i, need(dialogOf(view), "a dialog is open"))[0], "the dialog's Delete button"));
    await view.settle(8);
    expect(rowNodes(view)).toHaveLength(0);
    expect(count(view)).toBe(0);
    expect(view.text()).toMatch(/No key people yet/i);
  });

  it("Edge case: pressing the dialog's Delete twice while the request is pending sends one DELETE", async () => {
    const { view, api, server } = await openKeyPeople({ draft: peopleDraft(), configure: (s) => s.hold() });
    await askToDelete(view);
    const confirm = need(buttons(view, /^delete( person)?$/i, need(dialogOf(view), "a dialog is open"))[0], "the dialog's Delete button");
    await view.click(confirm);
    await view.settle(3);
    await view.click(view.fresh(confirm) ?? confirm);
    await view.settle(3);
    server.release();
    await view.settle(8);
    expect(api.deletes).toHaveLength(1);
  });

  it("Edge case: when the server refuses, the person stays listed and the server's message is shown", async () => {
    const { view, api } = await openKeyPeople({
      draft: peopleDraft(),
      configure: (s) => void (s.writeFailure = { status: 409, message: "The saved revision changed." }),
    });
    await askToDelete(view);
    await view.click(need(buttons(view, /^delete( person)?$/i, need(dialogOf(view), "a dialog is open"))[0], "the dialog's Delete button"));
    await view.settle(8);
    expect(api.deletes).toHaveLength(1);
    expect(rowNodes(view)).toHaveLength(4);
    expect(count(view)).toBe(4);
    expect(view.text()).toContain("The saved revision changed.");
  });
});

describe("portrait upload", () => {
  const portraitInput = (view: View) => need(fileInput(view), "a file input for the portrait");

  it("the portrait file input is named for the portrait and accepts images", async () => {
    const { view } = await openKeyPeople({ draft: peopleDraft() });
    const input = portraitInput(view);
    expect(view.nameOf(input)).toMatch(/portrait|photo/i);
    expect(String(input.props.accept ?? "")).toMatch(/image\//);
  });

  it("uploads to the uploads API as kind=portraits, then revises the person with the returned reference", async () => {
    const { view, api, server } = await openKeyPeople({ draft: peopleDraft() });
    await selectRow(view, 1);
    await chooseFile(view, portraitInput(view), png("tomas.png"));
    expect(api.uploads, "one upload").toHaveLength(1);
    expect(api.uploads[0].path).toBe(`${company}/uploads`);
    const form = api.uploads[0].form;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("kind")).toBe("portraits");
    const file = form.get("file") as File;
    expect(file).toBeInstanceOf(Blob);
    expect(file.size).toBe(64);
    const revisions = server.writesTo("revisions");
    expect(revisions, "one revision").toHaveLength(1);
    expect(revisions[0].path).toBe(`${company}/entries/${PERSON_IDS[1]}/revisions`);
    const body = SaveEntrySchema.parse(revisions[0].body);
    expect(body.expectedRevision).toBe(2);
    const { id, path, content_type, size_bytes } = api.uploaded[0];
    expect(body.content).toEqual({ ...TOMAS, portrait: { id, path, content_type, size_bytes } });
    // the upload is sent before the revision
    expect(server.requests.findIndex((r) => r.path.endsWith("/uploads"))).toBeLessThan(server.requests.findIndex((r) => r.path.endsWith("/revisions")));
  });

  it("afterwards the person shows that portrait from the same-origin uploads URL instead of initials", async () => {
    const { view, api } = await openKeyPeople({ draft: peopleDraft() });
    await selectRow(view, 1);
    expect(view.page().$("img").length, "only Maya has an image so far").toBeGreaterThan(0);
    expect(showsInitials(view.page(), peopleRows(view.page())[1], "TL")).toBe(true);
    await chooseFile(view, portraitInput(view), png());
    const page = view.page();
    const srcs = page.$("img").toArray().map((i) => page.$(i).attr("src"));
    expect(srcs).toContain(`${company}/uploads/${api.uploaded[0].id}`);
    expect(srcs).toContain(PORTRAIT_URL);
    for (const src of srcs) {
      expect(src).toMatch(new RegExp(`^${company}/uploads/[0-9a-f-]{36}$`));
    }
    expect(showsInitials(page, peopleRows(page)[1], "TL"), "the portrait replaces the initials").toBe(false);
  });

  it("a person who already has a portrait gets the new reference in place of the old", async () => {
    const { view, api, server } = await openKeyPeople({ draft: peopleDraft() });
    await chooseFile(view, portraitInput(view), png("new.png"));
    const body = SaveEntrySchema.parse(server.writesTo("revisions")[0].body);
    expect((body.content as { portrait: { id: string } }).portrait.id).toBe(api.uploaded[0].id);
    expect((body.content as { name: string }).name).toBe(MAYA.name);
    const srcs = view.page().$("img").toArray().map((i) => view.page().$(i).attr("src"));
    expect(srcs).not.toContain(PORTRAIT_URL);
  });

  it.each([
    [415, "unsupported_type", "Use PNG, JPG, GIF, WebP, or SVG"],
    [413, "payload_too_large", "Max 5MB"],
    [400, "invalid_input", "That file is empty."],
  ])("Edge case: a %i upload error shows the server's message inline and changes nothing", async (status, code, message) => {
    const { view, api, server } = await openKeyPeople({ draft: peopleDraft() });
    await selectRow(view, 1);
    api.uploadFailure = { status, code, message };
    await chooseFile(view, portraitInput(view), png("bad.gif"));
    expect(api.uploads).toHaveLength(1);
    expect(server.writesTo("revisions"), "no revision after a failed upload").toHaveLength(0);
    expect(view.text()).toContain(message);
    expect(view.page().$("img").length, "no new image").toBe(1);
    expect(rowNodes(view)).toHaveLength(4);
  });

  it("Edge case: the error clears after a later successful upload", async () => {
    const { view, api } = await openKeyPeople({ draft: peopleDraft() });
    api.uploadFailure = { status: 415, code: "unsupported_type", message: "Use PNG, JPG, GIF, WebP, or SVG" };
    await chooseFile(view, portraitInput(view), png("bad.bmp"));
    expect(view.text()).toContain("Use PNG, JPG, GIF, WebP, or SVG");
    api.uploadFailure = null;
    await chooseFile(view, portraitInput(view), png("good.png"));
    expect(view.text()).not.toContain("Use PNG, JPG, GIF, WebP, or SVG");
    expect(api.uploads).toHaveLength(2);
  });

  it("Edge case: when saving the revision is refused, the server's message is shown and no portrait appears", async () => {
    const { view, server } = await openKeyPeople({
      draft: peopleDraft(),
      configure: (s) => void (s.writeFailure = { status: 409, message: "The saved revision changed." }),
    });
    await selectRow(view, 1);
    await chooseFile(view, portraitInput(view), png());
    expect(server.writesTo("revisions")).toHaveLength(1);
    expect(view.text()).toContain("The saved revision changed.");
    expect(view.page().$("img").length).toBe(1);
  });
});
