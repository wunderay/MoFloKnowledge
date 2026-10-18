// Acceptance: the Key People section of /knowledge/view.
// Static server markup through the real page. Assertions use headings, labels, displayed values,
// accessible names, aria state, image sources and link hrefs only; none depends on class names or
// markup depth. Interactions (create, delete, portrait upload) are in knowledge-view-people-actions.
import { describe, expect, it } from "vitest";
import { COMPANY_ID, EMPTY_COMPANY_ID, buildEmptyDraft } from "../helpers/knowledge-view-fixtures";
import { headings, norm, textOf, type Page } from "../helpers/knowledge-view-dom";
import { addLinksOf, countBadge } from "../helpers/knowledge-view-offerings-brand-dom";
import { ALL_ORDER, duplicateIds, sectionHeading } from "../helpers/knowledge-view-site-all-dom";
import { openAll, openPeople } from "../helpers/knowledge-view-people-render";
import {
  ADD_PERSON,
  BAD,
  DELETE_PERSON,
  DETAIL,
  controls,
  detail,
  detailGroup,
  fileInputs,
  groupText,
  headingCount,
  peopleList,
  peopleRows,
  selectedIndexes,
  showsInitials,
  type Label,
} from "../helpers/knowledge-view-people-dom";
import {
  MARKS,
  MAYA,
  PEOPLE,
  PERSON_IDS,
  PORTRAIT_URL,
  PRIYA,
  REASONS,
  TOMAS,
  UNNAMED,
  evidenceFixture,
  hostileDraft,
  peopleDraft,
  peopleSnapshot,
  personAddHref,
  viewerDraft,
} from "../helpers/knowledge-view-people-fixtures";

const rows = (page: Page) => {
  const list = peopleList(page);
  expect(list, 'a list/navigation with the accessible name "Key people"').not.toBeNull();
  return peopleRows(page);
};
const shown = (page: Page, label: Label) => {
  expect(detailGroup(page, label), `the detail shows a "${label}" card/label`).not.toBeNull();
  return groupText(page, label);
};
const imgs = (page: Page) => page.$("img").toArray().map((i) => ({ src: page.$(i).attr("src") ?? "", alt: page.$(i).attr("alt") }));

describe("fixtures", () => {
  // guard
  it("there are four people: the third has only a name, the fourth has no name, and Tomas is 0 years old", () => {
    expect(PEOPLE).toHaveLength(4);
    expect(PRIYA.title).toBeNull();
    expect(UNNAMED.name).toBeNull();
    expect(TOMAS.age).toBe(0);
    expect(new Set(PERSON_IDS).size).toBe(4);
  });
});

describe("heading, count, add control and list", () => {
  it("shows a Key People heading with a count badge equal to the number of people", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const badge = countBadge(page, "Key People", peopleList(page));
    expect(badge.heading, 'a heading "Key People"').toBe(true);
    expect(badge.count).toBe(4);
  });

  it("an editable draft has an 'Add person' button or link", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    expect(controls(page, ADD_PERSON), 'a control named "Add person"').toHaveLength(1);
  });

  it("lists every person in order, each with the name and the position as a subtitle", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const all = rows(page);
    expect(all).toHaveLength(4);
    const texts = all.map((r) => textOf(page, r));
    for (const [i, p] of [MAYA, TOMAS].entries()) {
      expect(texts[i], `row ${i + 1} shows the name`).toContain(p.name);
      const afterName = texts[i].slice(texts[i].indexOf(p.name!) + p.name!.length);
      expect(afterName, "the position follows the name").toContain(p.title);
    }
    expect(texts[2]).toContain("Priya Nair");
  });

  it("Edge case: a person without a name is listed as 'Untitled person ...', with no 'null' for a missing position", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const all = rows(page);
    expect(textOf(page, all[3])).toMatch(/Untitled person/);
    expect(textOf(page, all[3])).toContain("Barista trainer");
    for (const r of all) {
      expect(textOf(page, r)).not.toMatch(BAD);
    }
    expect(textOf(page, all[0])).not.toContain("Untitled person");
  });

  it("selects the first person by default, and only that one", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    rows(page);
    expect(selectedIndexes(page)).toEqual([0]);
    expect(shown(page, "Name")).toContain(MAYA.name);
  });

  it.each([1, 2, 3])("the person URL parameter selects person %i, and only that one", async (index) => {
    const page = await openPeople({ draft: peopleDraft(), person: PERSON_IDS[index] });
    rows(page);
    expect(selectedIndexes(page)).toEqual([index]);
    expect(shown(page, "Description")).toContain(PEOPLE[index].background_or_relevance ?? "No description");
  });

  it.each(["00000000-0000-4000-8000-00000ffdead0", "not-an-id", "", "<script>alert(1)</script>"])(
    "Edge case: an unknown person parameter (%j) falls back to the first person",
    async (person) => {
      const page = await openPeople({ draft: peopleDraft(), person });
      rows(page);
      expect(selectedIndexes(page)).toEqual([0]);
      expect(shown(page, "Name")).toContain(MAYA.name);
    },
  );

  it("Edge case: a company with no people shows the heading with 0, an empty state with a link to the editor, and no rows", async () => {
    const page = await openPeople({ draft: buildEmptyDraft() });
    const badge = countBadge(page, "Key People");
    expect(badge.heading).toBe(true);
    expect(badge.count).toBe(0);
    expect(norm(page.$.root().text())).toMatch(/No key people yet/i);
    expect(peopleRows(page)).toHaveLength(0);
    const links = page.$("a[href]").toArray().map((a) => page.$(a).attr("href"));
    expect(links).toContain(personAddHref(EMPTY_COMPANY_ID));
  });

  it("the list is operable from the keyboard: one button per person, none nested in another control", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    rows(page).forEach((row, i) => {
      const buttons = page.$(row).find("button[type=button]");
      expect(buttons.length, `row ${i + 1}`).toBe(1);
      expect(page.$(buttons[0]).attr("tabindex")).toBeUndefined();
      expect(page.$(buttons[0]).find("button,a").length).toBe(0);
    });
  });
});

describe("detail", () => {
  it("shows Name, Position, Age, Gender, Nationality and Description labels, each heading its own card", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const d = detail(page);
    expect(new Set(Object.values(d)).size).toBe(DETAIL.length);
  });

  it("shows the selected person's values", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    expect(shown(page, "Name")).toContain(MAYA.name);
    expect(shown(page, "Position")).toContain(MAYA.title);
    expect(shown(page, "Age")).toMatch(/(^|\D)41(\D|$)/);
    expect(shown(page, "Gender")).toContain("Female");
    expect(shown(page, "Nationality")).toContain("American");
    expect(shown(page, "Description")).toContain(MAYA.background_or_relevance);
    for (const label of DETAIL) {
      expect(addLinksOf(page, detailGroup(page, label)!), `${label} is filled: no "+ Add"`).toEqual([]);
      expect(shown(page, label)).not.toMatch(BAD);
    }
  });

  it("Edge case: age 0 is shown as 0, not as an empty state", async () => {
    const page = await openPeople({ draft: peopleDraft(), person: PERSON_IDS[1] });
    expect(shown(page, "Age")).toMatch(/(^|\D)0(\D|$)/);
    expect(addLinksOf(page, detailGroup(page, "Age")!)).toEqual([]);
    expect(shown(page, "Age")).not.toMatch(/\bno age\b/i);
  });

  it("Edge case: every empty field has a '+ Add' empty state opening the editor on this person", async () => {
    const page = await openPeople({ draft: peopleDraft(), person: PERSON_IDS[2] });
    const href = `${personAddHref(COMPANY_ID)}&entryId=${PERSON_IDS[2]}`;
    expect(addLinksOf(page, detailGroup(page, "Name")!)).toEqual([]);
    for (const label of ["Position", "Age", "Gender", "Nationality", "Description"] as const) {
      expect(addLinksOf(page, detailGroup(page, label)!), `${label} empty state`).toEqual([href]);
      expect(shown(page, label)).not.toMatch(BAD);
    }
  });

  it("Edge case: an unnamed person shows the Name empty state and the other values", async () => {
    const page = await openPeople({ draft: peopleDraft(), person: PERSON_IDS[3] });
    expect(addLinksOf(page, detailGroup(page, "Name")!)).toEqual([`${personAddHref(COMPANY_ID)}&entryId=${PERSON_IDS[3]}`]);
    expect(shown(page, "Position")).toContain("Barista trainer");
    expect(shown(page, "Description")).toContain(UNNAMED.background_or_relevance);
  });

  it("Edge case: text is escaped, never parsed as markup", async () => {
    const page = await openPeople({ draft: hostileDraft() });
    expect(page.$("script").toArray().filter((s) => page.$(s).text().includes('alert'))).toHaveLength(0);
    expect(page.$("[onerror],[onload]").length).toBe(0);
    expect(page.$("svg[onload]").length).toBe(0);
    expect(page.$("b").toArray().filter((b) => page.$(b).text() === "bold")).toHaveLength(0);
    expect(shown(page, "Name")).toContain("Eve");
    expect(shown(page, "Name")).toContain("<script>alert(2)</script>");
    expect(page.html).not.toContain("<script>alert(2)");
  });
});

describe("portrait or initials", () => {
  it("a person with a portrait shows that image, served from the company's uploads URL; one without shows initials and no image", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const all = rows(page);
    const rowImgs = all.map((r) => page.$(r).find("img").toArray().map((i) => page.$(i).attr("src")));
    expect(rowImgs).toEqual([[PORTRAIT_URL], [], [], []]);
    expect(showsInitials(page, all[1], "TL"), "Tomas Lindqvist shows TL").toBe(true);
    expect(showsInitials(page, all[2], "PN"), "Priya Nair shows PN").toBe(true);
    expect(showsInitials(page, all[0], "MO"), "a portrait replaces the initials").toBe(false);
  });

  it("every image has an alt attribute, and the detail of a person with a portrait shows the same image", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    const all = imgs(page);
    expect(all.length).toBeGreaterThan(1);
    for (const i of all) {
      expect(i.alt, "alt attribute present").not.toBeUndefined();
      expect(i.src).toBe(PORTRAIT_URL);
    }
  });

  it("the detail of a person without a portrait shows no image at all", async () => {
    const page = await openPeople({ draft: peopleDraft(), person: PERSON_IDS[1] });
    expect(shown(page, "Name")).toContain(TOMAS.name);
    const inRows = peopleRows(page).flatMap((r) => page.$(r).find("img").toArray());
    expect(page.$("img").length).toBe(inRows.length);
  });

  it("Edge case: an unnamed person shows a placeholder avatar without 'null' or 'undefined'", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    expect(textOf(page, rows(page)[3])).not.toMatch(BAD);
  });

  it("Safety: an image source is only the same-origin uploads URL built from the reference id, never a stored address", async () => {
    const page = await openPeople({ draft: hostileDraft() });
    const srcs = imgs(page).map((i) => i.src);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(src).toBe(PORTRAIT_URL);
    }
    for (const el of page.$("*").toArray()) {
      for (const [name, value] of Object.entries((el as { attribs: Record<string, string> }).attribs)) {
        expect(`${name}=${value}`, "no stored address in any attribute").not.toMatch(/evil\.example|javascript:/i);
      }
    }
  });
});

describe.each(["snapshot", "viewer"] as const)("read only (%s)", (kind) => {
  const open = (extra: { person?: string } = {}) =>
    kind === "snapshot" ? openPeople({ snapshot: peopleSnapshot(), ...extra }) : openPeople({ draft: viewerDraft(), ...extra });

  it("still lists and shows the people", async () => {
    const page = await open();
    expect(rows(page)).toHaveLength(4);
    expect(countBadge(page, "Key People", peopleList(page)).count).toBe(4);
    expect(shown(page, "Name")).toContain(MAYA.name);
    expect(imgs(page).map((i) => i.src)).toContain(PORTRAIT_URL);
  });

  it("offers no way to add a person, delete one or upload a portrait", async () => {
    const page = await open();
    expect(rows(page), "the people are listed").toHaveLength(4);
    expect(shown(page, "Name")).toContain(MAYA.name);
    expect(controls(page, ADD_PERSON)).toHaveLength(0);
    expect(controls(page, DELETE_PERSON)).toHaveLength(0);
    expect(controls(page, /upload|change (portrait|photo)|remove (portrait|photo)|delete|add person/i)).toHaveLength(0);
    expect(fileInputs(page)).toHaveLength(0);
  });
});

describe("an owner's draft", () => {
  it("offers Delete for the selected person and a portrait file input that accepts images", async () => {
    const page = await openPeople({ draft: peopleDraft() });
    expect(controls(page, DELETE_PERSON), "one Delete control for the selected person").toHaveLength(1);
    expect(controls(page, DELETE_PERSON)[0] && norm(page.$(controls(page, DELETE_PERSON)[0]).attr("aria-label") ?? page.$(controls(page, DELETE_PERSON)[0]).text())).toMatch(/delete/i);
    const inputs = fileInputs(page);
    expect(inputs, "one file input for the portrait").toHaveLength(1);
    expect(page.$(inputs[0]).attr("accept") ?? "").toMatch(/image\//);
  });
});

describe("All sections", () => {
  it("shows Key People under its own heading, after Sales & Marketing and before Site Knowledge, with the same count", async () => {
    const page = await openAll({ draft: peopleDraft() });
    for (const label of ALL_ORDER) {
      expect(sectionHeading(page, label), `heading ${label}`).not.toBeNull();
    }
    const order = headings(page).map((h) => h.text.replace(/\s+\d+$/, ""));
    const at = (label: string) => order.findIndex((t) => t.toLowerCase() === label.toLowerCase());
    expect(at("Sales & Marketing")).toBeLessThan(at("Key People"));
    expect(at("Key People")).toBeLessThan(at("Site Knowledge"));
    expect(headingCount(page).count).toBe(4);
  });

  it("lists the same people as the section on its own, and shows the selected person's detail", async () => {
    const alone = await openPeople({ draft: peopleDraft() });
    const all = await openAll({ draft: peopleDraft() });
    expect(peopleRows(all).map((r) => textOf(all, r))).toEqual(peopleRows(alone).map((r) => textOf(alone, r)));
    expect(selectedIndexes(all)).toEqual([0]);
    expect(groupText(all, "Position")).toContain(MAYA.title);
    expect(groupText(all, "Nationality")).toContain("American");
    expect(controls(all, ADD_PERSON)).toHaveLength(1);
    expect(imgs(all).map((i) => i.src)).toContain(PORTRAIT_URL);
  });

  it("Edge case: no duplicate ids; a snapshot of All sections is read only", async () => {
    const page = await openAll({ draft: peopleDraft() });
    expect(duplicateIds(page)).toEqual([]);
    const snap = await openAll({ snapshot: peopleSnapshot() });
    expect(peopleRows(snap)).toHaveLength(4);
    expect(controls(snap, ADD_PERSON)).toHaveLength(0);
    expect(controls(snap, DELETE_PERSON)).toHaveLength(0);
    expect(fileInputs(snap)).toHaveLength(0);
  });

  it("Edge case: a company with no people shows Key People with count 0 in All sections", async () => {
    const page = await openAll({ draft: buildEmptyDraft() });
    expect(sectionHeading(page, "Key People")).not.toBeNull();
    expect(headingCount(page).count).toBe(0);
    expect(norm(page.$.root().text())).toMatch(/No key people yet/i);
  });
});

const open = {
  draft: (person?: string) => openPeople({ draft: evidenceFixture().draft, person }),
  snapshot: (person?: string) => openPeople({ snapshot: evidenceFixture().snapshot(), person }),
};
const controlsOf = (page: Page) =>
  page.$("button.citation-popover__trigger").toArray().map((b) => ({ name: page.$(b).attr("aria-label") ?? "", shown: norm(page.$(b).text()) }));

describe.each(["draft", "snapshot"] as const)("evidence (%s)", (source) => {
  it("the evidence fixture carries the claims it describes", () => {
    expect(MARKS).toHaveLength(3);
    expect(evidenceFixture().claims).toHaveLength(3);
  });

  it("a person whose own claims are non-source carries a marker named by their name; the others have none", async () => {
    const page = await open[source]();
    const markers = rows(page).map((row) =>
      page.$(row).find("button.citation-popover__trigger").toArray().map((b) => ({ name: page.$(b).attr("aria-label"), shown: norm(page.$(b).text()) })),
    );
    expect(markers).toEqual([
      [{ name: `User correction: evidence for ${MAYA.name}`, shown: "User correction ⓘ" }],
      [{ name: `Historical inferred: evidence for ${TOMAS.name}`, shown: "Historical inferred ⓘ" }],
      [],
      [],
    ]);
  });

  it("each detail card has one control named by its field and the person", async () => {
    const page = await open[source]();
    const nouns: Record<string, string> = { Name: "name", Position: "position" };
    for (const label of ["Name", "Position"] as const) {
      const own = page.$(detailGroup(page, label)!).find("button.citation-popover__trigger").toArray().map((b) => page.$(b).attr("aria-label"));
      expect(own, `card "${label}"`).toHaveLength(1);
      expect(own[0]).toMatch(new RegExp(`: evidence for ${nouns[label]} of ${MAYA.name}$`));
    }
    expect(page.$(detailGroup(page, "Position")!).find("button.citation-popover__trigger").first().text()).toContain("User correction");
  });

  it("a historical inference on the description of the selected person is named in its card", async () => {
    const page = await open[source](PERSON_IDS[1]);
    expect(controlsOf(page).map((c) => c.name)).toContain(`Historical inferred: evidence for description of ${TOMAS.name}`);
    expect(norm(page.$(detailGroup(page, "Description")!).find("button.citation-popover__trigger").first().text())).toBe("Historical inferred ⓘ");
  });

  it.each([undefined, PERSON_IDS[1], PERSON_IDS[3]])("no evidence control is named by a raw id or path (person=%s)", async (person) => {
    const page = await open[source](person);
    const all = controlsOf(page);
    expect(all.length).toBeGreaterThan(2);
    for (const { name } of all) {
      expect(name).not.toContain("@");
      expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(name).not.toMatch(/\//);
    }
  });

  it("empty or not-found fields print their coverage reason; found values print none", async () => {
    const page = await open[source](PERSON_IDS[2]);
    expect(shown(page, "Age")).toContain(`Not found in checked pages — ${REASONS.noAge}`);
    expect(shown(page, "Gender")).toContain(`Unknown · Not assessed — ${REASONS.noGender}`);
    expect(shown(page, "Nationality")).toContain("No assessment is recorded for this field.");
    expect(shown(page, "Name")).not.toMatch(/Unknown|Partial|Conflicting|Not found/);
  });

  it("a filled field that is only partly found prints its reason next to the value", async () => {
    const page = await open[source]();
    expect(shown(page, "Description")).toContain(MAYA.background_or_relevance!);
    expect(shown(page, "Description")).toContain(`Partial — ${REASONS.description}`);
    expect(shown(page, "Gender")).not.toMatch(/Unknown|Partial|Conflicting|Not found/);
  });
});

describe("draft and snapshot agree", () => {
  it("a snapshot shows the same evidence controls as its draft", async () => {
    for (const person of [undefined, PERSON_IDS[1]]) {
      const fromDraft = controlsOf(await open.draft(person));
      expect(fromDraft.length).toBeGreaterThan(2);
      expect(controlsOf(await open.snapshot(person))).toEqual(fromDraft);
    }
  });
});
