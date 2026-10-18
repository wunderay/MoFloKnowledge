// Acceptance: draft/snapshot parity and non-regression of the existing
// viewer chrome for /knowledge/view.
import { describe, expect, it } from "vitest";
import { KnowledgeBaseExportSchema } from "../../src/contracts";
import { renderViewPage } from "../helpers/knowledge-view-render";
import {
  COMPANY_ID,
  COMPANY_NAME,
  FOUNDING_STORY,
  OLDER_SNAPSHOT_ID,
  OVERVIEW,
  SNAPSHOT_ID,
  VERSIONS,
  buildBusiness,
  buildDraft,
  draftFrom,
  snapshotFrom,
} from "../helpers/knowledge-view-fixtures";
import {
  banner,
  card,
  cardText,
  headings,
  norm,
  parse,
  selectedSection,
  textOf,
  type Page,
} from "../helpers/knowledge-view-dom";
import {
  BANNER_LABEL,
  CARD_SECTIONS,
  openSection,
  sectionId,
  titlesOf,
  type CardSection,
} from "../helpers/knowledge-view-spec";

const draft = buildDraft();
const snapshot = { payload: snapshotFrom(draft), versionId: SNAPSHOT_ID };

/** Draft-only chrome that a saved snapshot legitimately does not have. */
const DRAFT_ONLY = /Edit draft|View draft|History|Remove from future versions/g;
function signature(page: Page, section: CardSection) {
  const titles = titlesOf(section);
  const name = section === "Customers & Industry" ? buildBusiness().company_foundation.industry! : COMPANY_NAME;
  const el = banner(page, BANNER_LABEL[section], name);
  return {
    banner: el ? textOf(page, el).replace(DRAFT_ONLY, "").replace(/\s+/g, " ").trim() : null,
    cards: titles.map((t) => {
      const c = card(page, t, titles);
      return [t, c ? cardText(page, c).replace(DRAFT_ONLY, "").replace(/\s+/g, " ").trim() : null];
    }),
  };
}

describe("fixtures", () => {
  // guard: the snapshot is a valid saved knowledge base built from the same data
  it("snapshot is a valid KnowledgeBaseExport carrying the draft's business data", () => {
    expect(() => KnowledgeBaseExportSchema.parse(snapshot.payload)).not.toThrow();
    expect(snapshot.payload.company_foundation.overview).toBe(OVERVIEW);
    expect(snapshot.payload.positioning.founding_story).toBe(FOUNDING_STORY);
  });
});

describe("draft and saved snapshot", () => {
  it.each(CARD_SECTIONS)("%s: a snapshot renders the same banner and cards as the (read-only) draft it was made from", async (section) => {
    // An owner's draft edits these sections in place, which a snapshot cannot; a viewer's draft reads like one.
    const readOnlyDraft = { ...draft, company: { ...draft.company, role: "viewer" as const } };
    const fromDraft = signature(await openSection(section, { draft: readOnlyDraft }), section);
    const fromSnapshot = signature(await openSection(section, { snapshot }), section);
    expect(fromDraft.banner, "draft banner").not.toBeNull();
    expect(fromSnapshot.banner, "snapshot banner").not.toBeNull();
    expect(fromDraft.cards.every(([, text]) => text), "every draft card renders").toBe(true);
    expect(fromSnapshot).toEqual(fromDraft);
  });

  it("a snapshot opens on General Info with its selector and values", async () => {
    const page = parse(await renderViewPage({ snapshot, versions: VERSIONS }));
    expect(selectedSection(page)).toEqual(["General Info"]);
    const titles = titlesOf("General Info");
    expect(cardText(page, card(page, "Overview", titles)!)).toContain(OVERVIEW);
    expect(cardText(page, card(page, "Founding story", titles)!)).toContain(FOUNDING_STORY);
  });

  it("Edge case: a snapshot whose positioning entry was rejected shows the founding story empty state and keeps the rest", async () => {
    const page = await openSection("General Info", {
      snapshot: { payload: snapshotFrom(draft, { rejected: ["positioning"] }), versionId: SNAPSHOT_ID },
    });
    const titles = titlesOf("General Info");
    expect(cardText(page, card(page, "Founding story", titles)!)).toMatch(/No founding story yet/i);
    expect(cardText(page, card(page, "Overview", titles)!)).toContain(OVERVIEW);
    expect(banner(page, "Company", COMPANY_NAME)).not.toBeNull();
  });

  it("Edge case: a snapshot with an absent positioning entry state also shows the empty state, and Sales & Marketing still renders", async () => {
    const payload = snapshotFrom(draft, { absent: ["positioning"] });
    const general = await openSection("General Info", { snapshot: { payload, versionId: SNAPSHOT_ID } });
    expect(cardText(general, card(general, "Founding story", titlesOf("General Info"))!)).toMatch(/No founding story yet/i);
    const sales = await openSection("Sales & Marketing", { snapshot: { payload, versionId: SNAPSHOT_ID } });
    const titles = titlesOf("Sales & Marketing");
    expect(cardText(sales, card(sales, "Pitch", titles)!)).not.toBe("");
    expect(cardText(sales, card(sales, "Ideal persona", titles)!)).toContain("Morning-ritual Mia");
  });

  it("Edge case: a snapshot of a rejected market entry empties its Buyers card and keeps the foundation-held values", async () => {
    const page = await openSection("Customers & Industry", {
      snapshot: { payload: snapshotFrom(draft, { rejected: ["market_and_customers"] }), versionId: SNAPSHOT_ID },
    });
    const titles = titlesOf("Customers & Industry");
    for (const t of titles) {
      expect(card(page, t, titles), `card "${t}"`).not.toBeNull();
    }
    expect(cardText(page, card(page, "Business model", titles)!)).toContain(buildBusiness().company_foundation.business_model);
    expect(cardText(page, card(page, "Buyers", titles)!)).not.toContain("Home coffee enthusiasts");
  });
});

describe("existing viewer capabilities stay reachable", () => {
  const draftPage = async (opts: { role?: "owner" | "viewer"; mode?: "json" | "table" } = {}) =>
    parse(
      await renderViewPage({
        draft: draftFrom(buildBusiness(), { role: opts.role }),
        versions: VERSIONS,
        mode: opts.mode,
      }),
    );
  const snapshotPage = async (mode?: "json" | "table") =>
    parse(await renderViewPage({ snapshot, versions: VERSIONS, mode }));
  const control = (page: Page, name: string) =>
    page.$(`[aria-label="${name}"]`).first();

  it("the version selector lists the draft and every saved version, with the draft selected", async () => {
    const page = await draftPage();
    const options = control(page, "Knowledge version").find("option").toArray().map((o) => ({
      text: norm(page.$(o).text()), value: page.$(o).attr("value"), selected: page.$(o).attr("selected") !== undefined,
    }));
    expect(options.map((o) => o.value)).toEqual(["draft", SNAPSHOT_ID, OLDER_SNAPSHOT_ID]);
    expect(options[0].text).toBe("Current draft");
    expect(options[1].text).toMatch(/^Version 2\b/);
    expect(options[2].text).toMatch(/^Version 1\b/);
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(["draft"]);
  });

  it("the version selector marks the opened snapshot as selected", async () => {
    const page = await snapshotPage();
    const selected = control(page, "Knowledge version").find("option[selected]").toArray().map((o) => page.$(o).attr("value"));
    expect(selected).toEqual([SNAPSHOT_ID]);
  });

  it("document download: a GET form to the document endpoint with JSON, Word and PDF formats", async () => {
    const page = await draftPage();
    const format = control(page, "Export format");
    expect(format.find("option").toArray().map((o) => page.$(o).attr("value"))).toEqual(["json", "docx", "pdf"]);
    const form = format.closest("form");
    expect(form.attr("action")).toBe(`/api/companies/${COMPANY_ID}/document`);
    expect((form.attr("method") ?? "").toUpperCase()).toBe("GET");
    expect(form.find('input[name="versionId"]').attr("value")).toBe("draft");
    expect(norm(form.find("button[type=submit]").text())).toMatch(/^Export\b/);
  });

  it("a saved snapshot offers 'Download JSON' for that version and the current-draft link", async () => {
    const page = await snapshotPage();
    const download = page.$("a").toArray().filter((a) => norm(page.$(a).text()).startsWith("Download JSON"));
    expect(download.map((a) => page.$(a).attr("href"))).toEqual([`/api/companies/${COMPANY_ID}/versions/${SNAPSHOT_ID}/download`]);
    const open = page.$("a").toArray().filter((a) => norm(page.$(a).text()) === "Open current draft");
    expect(open.map((a) => page.$(a).attr("href"))).toEqual([`/knowledge?companyId=${COMPANY_ID}`]);
    expect(page.$("body").text() + page.html).toMatch(/read only/);
  });

  it("the draft view offers review actions: Edit draft links, History and Remove from future versions", async () => {
    const page = await draftPage();
    const edits = page.$("a").toArray().filter((a) => norm(page.$(a).text()) === "Edit draft").map((a) => page.$(a).attr("href")!);
    expect(edits.length).toBeGreaterThan(0);
    for (const href of edits) {
      expect(href).toMatch(new RegExp(`^/knowledge\\?companyId=${COMPANY_ID}&category=[a-z_]+&entryId=[0-9a-f-]{36}$`));
    }
    const buttons = page.$("button").toArray().map((b) => norm(page.$(b).text()));
    expect(buttons).toContain("History");
    expect(buttons).toContain("Remove from future versions");
  });

  it("Edge case: a viewer role can read but not remove: 'View draft' replaces 'Edit draft' and Remove is absent", async () => {
    const page = await draftPage({ role: "viewer" });
    const links = page.$("a").toArray().map((a) => norm(page.$(a).text()));
    const buttons = page.$("button").toArray().map((b) => norm(page.$(b).text()));
    expect(links).toContain("View draft");
    expect(links).not.toContain("Edit draft");
    expect(buttons).not.toContain("Remove from future versions");
  });

  it("a saved snapshot offers no draft review actions", async () => {
    const page = await snapshotPage();
    const labels = page.$("a,button").toArray().map((a) => norm(page.$(a).text()));
    for (const draftOnly of ["Edit draft", "View draft", "Remove from future versions"]) {
      expect(labels).not.toContain(draftOnly);
    }
  });

  it("the display-mode switch still offers Table and Json", async () => {
    const page = await draftPage();
    const labels = control(page, "Display mode").find("button").toArray().map((b) => norm(page.$(b).text()));
    expect(labels).toContain("Table");
    expect(labels).toContain("Json");
  });

  // (depends on the viewer's existing "profile" default and "table"/"json" mode values)
  it("table mode lists the draft's entries with Entry / Category / Review / Revision columns", async () => {
    const page = await draftPage({ mode: "table" });
    expect(page.$("th").toArray().map((h) => norm(page.$(h).text())).filter(Boolean)).toEqual(["Entry", "Category", "Review", "Revision"]);
    const rows = page.$("tbody tr").toArray().map((r) => norm(page.$(r).text()));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.some((r) => r.includes("Company foundation"))).toBe(true);
  });

  // (same dependency as above)
  it("json mode prints the draft's data as JSON text", async () => {
    const page = await draftPage({ mode: "json" });
    const pre = norm(page.$("pre").first().text());
    expect(pre).toContain('"company_foundation"');
    expect(pre).toContain(OVERVIEW);
  });

  // (same dependency as above)
  it("json mode on a snapshot prints the saved knowledge base", async () => {
    const page = await snapshotPage("json");
    const pre = page.$("pre").first().text();
    const parsed = JSON.parse(pre);
    expect(parsed.knowledge_base_version_id).toBe(SNAPSHOT_ID);
    expect(parsed.company_foundation.overview).toBe(OVERVIEW);
  });
});

describe("parity guard", () => {
  // behavioural: the section chosen by URL survives alongside the version chosen by URL
  it("a snapshot honours the section parameter", async () => {
    const id = await sectionId("Sales & Marketing");
    const page = parse(await renderViewPage({ snapshot, versions: VERSIONS, section: id }));
    expect(selectedSection(page)).toEqual(["Sales & Marketing"]);
    expect(headings(page).some((h) => h.text === "Calls to action")).toBe(true);
    expect(headings(page).some((h) => h.text === "Founding story")).toBe(false);
  });
});
