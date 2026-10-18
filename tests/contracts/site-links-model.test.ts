// Acceptance tests for Quest Q1 "sitelinks-model": the singleton `site_links` knowledge entry kind.
// Written from the acceptance criteria alone (C1-C4, C6 here; C5 in tests/knowledge, DB part of C3 in tests/db).
// Every `site_links` string reaches the code under test through a cast so that the base commit fails on
// assertions, never on import or type errors.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BusinessSchema,
  EntryKindSchema,
  FIELD_REGISTRY,
  allowedOriginsForTarget,
  createEmptyBusiness,
  createEntryDefault,
  entryBusiness,
  entryRoot,
  fieldForTarget,
  parseBusinessEntry,
  requiredCoverageTargets,
  type EntryKind,
} from "../../src/contracts";
import { CATEGORY_SPECS } from "../../src/components/editor/business-fields";

const KIND = "site_links" as string as EntryKind;
const root = resolve(__dirname, "../..");
const id = (n: number) => `a2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const link = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  title: `Page ${n}`,
  url: `https://acme.example/page-${n}`,
  note: null,
  ...over,
});
const content = (...links: unknown[]) => ({ links });

/** True when the content parses. Any thrown error is a rejection; the valid-control assertions keep that honest. */
function accepted(value: unknown): boolean {
  try {
    parseBusinessEntry(KIND, value);
    return true;
  } catch {
    return false;
  }
}
/** A rejection is only meaningful if the same shape with valid values is accepted. */
function rejectsOnlyBecauseOfVariant(valid: unknown, variant: unknown) {
  expect(accepted(valid), "valid control must be accepted").toBe(true);
  expect(accepted(variant), "variant must be rejected").toBe(false);
}

describe("C1 [behavioural] site_links is a singleton entry kind with an empty default", () => {
  it("EntryKindSchema accepts site_links and still rejects unknown kinds", () => {
    expect(EntryKindSchema.safeParse("site_links").success).toBe(true);
    expect(EntryKindSchema.options).toContain("site_links");
    // Existing kinds are untouched (non-regression part of the same criterion).
    for (const kind of [
      "company_foundation", "positioning", "market_and_customers", "branding_and_style",
      "online_presence", "key_person", "offering",
    ]) expect(EntryKindSchema.safeParse(kind).success).toBe(true);
    for (const bad of ["site_link", "SITE_LINKS", "sitelinks", "", "links"])
      expect(EntryKindSchema.safeParse(bad).success).toBe(false);
  });

  it("createEntryDefault('site_links') is exactly { links: [] } and is a fresh object each time", () => {
    const first = createEntryDefault(KIND);
    expect(first).toEqual({ links: [] });
    (first as unknown as { links: unknown[] }).links.push("mutation");
    expect(createEntryDefault(KIND)).toEqual({ links: [] });
    // A singleton has no id of its own.
    expect(Object.keys(createEntryDefault(KIND))).toEqual(["links"]);
  });

  it("the default entry is itself a valid site_links entry (empty list is valid)", () => {
    expect(accepted(createEntryDefault(KIND))).toBe(true);
    expect(accepted({ links: [] })).toBe(true);
  });

  it("BusinessSchema includes site_links and createEmptyBusiness() provides the empty default", () => {
    const empty = createEmptyBusiness() as unknown as Record<string, unknown>;
    expect(empty.site_links).toEqual({ links: [] });
    expect(BusinessSchema.safeParse(empty).success).toBe(true);
    expect(Object.keys(BusinessSchema.shape)).toContain("site_links");
    // Required like the other singletons: omitting it is invalid.
    const { site_links: _omitted, ...without } = empty;
    expect(BusinessSchema.safeParse(without).success).toBe(false);
    // Populated business parses and round-trips the links in order.
    const populated = { ...empty, site_links: content(link(2), link(1)) };
    const parsed = BusinessSchema.parse(populated) as unknown as Record<string, { links: { id: string }[] }>;
    expect(parsed.site_links.links.map((item) => item.id)).toEqual([id(2), id(1)]);
  });

  it("BusinessSchema stays strict and validates nested site_links content", () => {
    const empty = createEmptyBusiness() as unknown as Record<string, unknown>;
    expect(BusinessSchema.safeParse({ ...empty, site_links: content(link(1)) }).success, "valid control").toBe(true);
    expect(BusinessSchema.safeParse({ ...empty, site_links: content(link(1, { url: "/about" })) }).success).toBe(false);
    expect(BusinessSchema.safeParse({ ...empty, site_links: content(link(1)), rogue: true }).success).toBe(false);
  });

  it("[non-regression] entryRoot and entryBusiness treat site_links as a singleton root", () => {
    expect(entryRoot(KIND, id(9))).toBe("/site_links");
    expect(entryBusiness(KIND, content(link(1)) as never)).toEqual({ site_links: content(link(1)) });
  });
});

describe("C2 [behavioural] link item shape: { id: uuid, title, url: absolute http(s), note: string | null }", () => {
  it("accepts valid items (null note, text note, several links, empty list)", () => {
    expect(accepted(content(link(1)))).toBe(true);
    expect(accepted(content(link(1, { note: "Reviewed by legal" })))).toBe(true);
    expect(accepted(content(link(1), link(2, { note: "x" }), link(3)))).toBe(true);
    expect(accepted(content())).toBe(true);
  });

  it("parseBusinessEntry returns the parsed content unchanged and in order", () => {
    const input = content(link(3, { note: "n" }), link(1), link(2));
    let parsed: unknown;
    expect(() => { parsed = parseBusinessEntry(KIND, input); }, "valid content must parse").not.toThrow();
    expect(parsed).toEqual(input);
  });

  it("accepts http and https URLs including path, query, fragment, port and bare internal hosts", () => {
    for (const url of [
      "http://acme.example/",
      "https://acme.example",
      "https://acme.example/a/b/c.html",
      "https://acme.example/search?q=a%20b&page=2#results",
      "https://acme.example:8443/admin",
      "http://intranet/handbook",
      "https://sub.domain.acme.example/path/",
    ]) expect(accepted(content(link(1, { url }))), url).toBe(true);
  });

  it("Edge case: relative and scheme-less URLs are rejected", () => {
    const valid = content(link(1));
    for (const url of ["/about", "about", "../about", "./about.html", "//acme.example/about", "www.acme.example/about", "acme.example", "?q=1", "#top"])
      rejectsOnlyBecauseOfVariant(valid, content(link(1, { url })));
  });

  it("Edge case: non-http(s) schemes are rejected, in any letter case and with control-character tricks", () => {
    const valid = content(link(1));
    for (const url of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "JavaScript:alert(document.cookie)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "DATA:text/html;base64,PHNjcmlwdD4=",
      "ftp://acme.example/file.txt",
      "FTP://acme.example/file.txt",
      "mailto:ops@acme.example",
      "tel:+15551234567",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
      "ws://acme.example/socket",
      "blob:https://acme.example/uuid",
    ]) rejectsOnlyBecauseOfVariant(valid, content(link(1, { url })));
  });

  it("Edge case: empty, whitespace-only, host-less and non-string URLs are rejected", () => {
    const valid = content(link(1));
    for (const url of ["", "   ", "http://", "https://", null, 42, undefined, ["https://acme.example"]])
      rejectsOnlyBecauseOfVariant(valid, content(link(1, { url })));
  });

  it("Edge case (DECISION): a URL carrying credentials is rejected, like every other URL in the knowledge base", () => {
    // C2 says "absolute http(s) URL"; the repo's only definition of that (URLSchema in primitives.ts and
    // private.valid_url in SQL) is "absolute HTTP(S) URL without credentials", so userinfo must not be stored.
    const valid = content(link(1));
    for (const url of ["https://user:secret@acme.example/admin", "http://admin@acme.example/"])
      rejectsOnlyBecauseOfVariant(valid, content(link(1, { url })));
  });

  it("Edge case: empty and whitespace-only titles are rejected; non-string or missing titles too", () => {
    const valid = content(link(1));
    for (const title of ["", " ", "   ", "\t\n", null, 7, undefined, ["About"]])
      rejectsOnlyBecauseOfVariant(valid, content(link(1, { title })));
    const { title: _removed, ...noTitle } = link(1);
    rejectsOnlyBecauseOfVariant(valid, content(noTitle));
  });

  it("Edge case: titles with surrounding whitespace, unicode or markup-looking text are ordinary text", () => {
    for (const title of ["  About us  ", "Über uns", "公司简介", "Pricing <b>&</b> plans", "A".repeat(200)])
      expect(accepted(content(link(1, { title }))), title).toBe(true);
  });

  it("Edge case: note must be a string or null (not a number, object or boolean)", () => {
    const valid = content(link(1));
    for (const note of [5, true, {}, ["x"]])
      rejectsOnlyBecauseOfVariant(valid, content(link(1, { note })));
    expect(accepted(content(link(1, { note: "A free-text note" })))).toBe(true);
    expect(accepted(content(link(1, { note: null })))).toBe(true);
  });

  it("Edge case: missing id, empty id and non-UUID ids are rejected", () => {
    const valid = content(link(1));
    const { id: _id, ...noId } = link(1);
    rejectsOnlyBecauseOfVariant(valid, content(noId));
    for (const bad of [null, "", "not-a-uuid", "12345", 7, "a2000000-0000-4000-8000-00000000000"])
      rejectsOnlyBecauseOfVariant(valid, content(link(1, { id: bad })));
  });

  it("Edge case: duplicate ids are rejected, even when everything else differs", () => {
    const valid = content(link(1), link(2));
    rejectsOnlyBecauseOfVariant(valid, content(link(1), link(2, { id: id(1) })));
    rejectsOnlyBecauseOfVariant(valid, content(link(1), link(2), link(3, { id: id(1) })));
    rejectsOnlyBecauseOfVariant(valid, content(link(1), link(1)));
  });

  it("Edge case: only ids must be unique; two links to the same URL or with the same title are fine", () => {
    expect(accepted(content(link(1), link(2, { url: link(1).url })))).toBe(true);
    expect(accepted(content(link(1), link(2, { title: link(1).title })))).toBe(true);
  });

  it("Edge case: unknown keys on an item or on the entry are rejected (strict contracts)", () => {
    const valid = content(link(1));
    rejectsOnlyBecauseOfVariant(valid, content(link(1, { rogue: "x" })));
    rejectsOnlyBecauseOfVariant(valid, { links: [link(1)], rogue: true });
  });

  it("Edge case: entry content must be an object with a links array", () => {
    const valid = content(link(1));
    expect(accepted(valid)).toBe(true);
    for (const bad of [null, undefined, [], "links", 3, {}, { links: null }, { links: link(1) }, { links: "x" }, { items: [link(1)] }])
      expect(accepted(bad), JSON.stringify(bad)).toBe(false);
  });

  it("Edge case: items that are not objects are rejected", () => {
    const valid = content(link(1));
    for (const item of [null, "https://acme.example", 5, []])
      rejectsOnlyBecauseOfVariant(valid, content(item));
  });
});

describe("C3 [behavioural + non-regression] database contract inputs", () => {
  const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");
  const migrations = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();

  it("[behavioural] the generated SQL contract sources know the kind (schema, default, registry)", () => {
    const schemas = JSON.parse(read("src/contracts/json-schemas.json")) as Record<string, any>;
    expect(Object.keys(schemas)).toContain("site_links");
    expect(schemas.site_links?.type).toBe("object");
    expect(schemas.site_links?.required).toContain("links");
    expect(schemas.site_links?.properties?.links?.type).toBe("array");
    const defaults = JSON.parse(read("src/contracts/defaults.json"));
    expect(defaults.site_links).toEqual({ links: [] });
    expect(defaults.site_links).toEqual(createEntryDefault(KIND));
    const registry = JSON.parse(read("src/contracts/field-registry.json")) as { path: string }[];
    expect(registry.map((field) => field.path)).toContain("/site_links/links");
  });

  it("[behavioural] a NEW migration (numbered after 0016) allows knowledge_entries.kind = 'site_links'", () => {
    const added = migrations.filter((name) => Number.parseInt(name.split("_")[0], 10) > 16);
    expect(added.length).toBeGreaterThan(0);
    const mentioning = added.filter((name) => /site_links/.test(read(`supabase/migrations/${name}`)));
    expect(mentioning.length).toBeGreaterThan(0);
    expect(mentioning.some((name) => /knowledge_entries/.test(read(`supabase/migrations/${name}`)))).toBe(true);
  });

  it("[non-regression] already-applied migrations 0001 (baseline CHECK) and 0009 (first import) are byte-identical", () => {
    const sha = (name: string) => createHash("sha256").update(readFileSync(resolve(root, "supabase/migrations", name))).digest("hex");
    expect(migrations).toContain("0009_finalization.sql");
    expect(sha("0009_finalization.sql")).toBe("23e4b3e5f281077096ff1e541ab5d83231f0e1e2392e14a6123e7bea894bd555");
    expect(sha("0001_baseline.sql")).toBe("e6deb46ce4ff470789ce93c323730be4b27a0212eb196b78f5c43b6e91b953d6");
  });

  it("[non-regression] 0009 still demands exactly the five original singletons for a first import (site_links stays optional)", () => {
    const text = read("supabase/migrations/0009_finalization.sql");
    expect(text).toContain("ARRAY['company_foundation','positioning','market_and_customers','branding_and_style','online_presence']");
    expect(text).not.toMatch(/site_links/);
  });

  it("[non-regression -> must stay green] node scripts/generate-sql-contract.mjs --check passes", () => {
    const result = spawnSync(process.execPath, ["scripts/generate-sql-contract.mjs", "--check"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});

describe("C4 [behavioural] field registry, provenance and coverage accept /site_links/links", () => {
  it("FIELD_REGISTRY has the /site_links/links field with an empty-list default", () => {
    const field = FIELD_REGISTRY.find((item) => item.path === "/site_links/links");
    expect(field).toBeDefined();
    expect(field).toMatchObject({ kind: "site_links", field: "links", default: [] });
    expect(field!.allowedOrigins).toContain("user_provided");
    expect(FIELD_REGISTRY.filter((item) => item.path === "/site_links/links")).toHaveLength(1);
  });

  it("every site_links registry default equals the entry default", () => {
    const fields = FIELD_REGISTRY.filter((item) => (item.kind as string) === "site_links");
    expect(fields.length).toBeGreaterThan(0);
    const defaults = Object.fromEntries(fields.map((item) => [item.field, item.default]));
    expect(defaults).toEqual(createEntryDefault(KIND));
  });

  it("targets inside the list resolve to the field and allow user-provided claims", () => {
    for (const target of ["/site_links/links", `/site_links/links/@${id(1)}/title`, `/site_links/links/@${id(1)}/url`, `/site_links/links/@${id(1)}/note`]) {
      expect(fieldForTarget(target)?.path, target).toBe("/site_links/links");
      expect(allowedOriginsForTarget(target), target).toContain("user_provided");
    }
    expect(fieldForTarget("/site_links/unknown")).toBeUndefined();
  });

  it("the registry does not leak site_links paths onto other kinds", () => {
    expect(fieldForTarget("/online_presence/links")).toBeUndefined();
    for (const item of FIELD_REGISTRY) if (item.path.startsWith("/site_links/")) expect(item.kind as string).toBe("site_links");
  });

  it("an empty business requires coverage for /site_links/links exactly once (DECISION: every registry field is coverage-required)", () => {
    const targets = requiredCoverageTargets(createEmptyBusiness());
    expect(targets.filter((target) => target === "/site_links/links")).toHaveLength(1);
  });

  it("[non-regression] the original 41 registry fields are still present", () => {
    // The six model fields (revenue, phone, age, nationality, portrait, images) came later and have their own tests.
    const later = ["/company_foundation/revenue", "/online_presence/phone", "/key_people/@id/age", "/key_people/@id/nationality", "/key_people/@id/portrait", "/offerings/@id/images"];
    const original = FIELD_REGISTRY.filter((item) => (item.kind as string) !== "site_links" && !later.includes(item.path));
    expect(original).toHaveLength(41);
    expect(requiredCoverageTargets(createEmptyBusiness()).filter((target) => !target.startsWith("/site_links") && !later.includes(target))).toHaveLength(31);
  });
});

describe("C6 [behavioural] CATEGORY_SPECS.site_links lets the editor edit the list", () => {
  it("has the Site links label and a description/icon like every other category", () => {
    const spec = CATEGORY_SPECS.site_links;
    expect(spec).toBeDefined();
    expect(spec!.label).toBe("Site links");
    expect(typeof spec!.description).toBe("string");
    expect(spec!.description.length).toBeGreaterThan(0);
    expect(typeof spec!.icon).toBe("string");
  });

  it("edits the `links` list through item fields title, url and note (and nothing else)", () => {
    const links = CATEGORY_SPECS.site_links?.fields.links;
    expect(links).toBeDefined();
    expect(Object.keys(CATEGORY_SPECS.site_links!.fields)).toEqual(["links"]);
    expect(links!.items).toBeDefined();
    expect(Object.keys(links!.items!.fields ?? {}).sort()).toEqual(["note", "title", "url"]);
  });

  it("the editable field names match the content contract", () => {
    const sample = link(1);
    const specFields = Object.keys(CATEGORY_SPECS.site_links?.fields.links?.items?.fields ?? {});
    expect(specFields.length).toBeGreaterThan(0);
    for (const name of specFields) expect(Object.keys(sample)).toContain(name);
  });

  it("[non-regression] existing categories keep their labels", () => {
    expect(CATEGORY_SPECS.online_presence.label).toBe("Online presence");
    expect(CATEGORY_SPECS.key_person.label).toBe("Key people");
    expect(CATEGORY_SPECS.offering.label).toBe("Offerings");
  });
});
