// Acceptance tests for Quest Q5 "model-fields", criterion C6 (coverage cap), TypeScript half. The SQL half is
// tests/db/model-fields-coverage-cap.test.mjs.
//
// DECISION D8 (the new maximum): a snapshot lists one coverage row per required target.
//   singleton fields: 13 company_foundation + 2 positioning + 9 market_and_customers + 5 branding_and_style
//                     + 2 online_presence + 1 site_links = 32 rows (the empty singletons are always present)
//   each key person:  8 rows (name, title, role, gender, background_or_relevance, age, nationality, portrait)
//   each offering:    8 rows (name, description, offering_type, category, features, pricing, url, images)
//   an empty collection contributes ONE row (/key_people or /offerings) instead.
// The collections allow 500 items each, but a published snapshot carries at most 500 claims and every populated person or
// offering needs at least one claim of its own (a claim names exactly one entry), so a legitimate snapshot holds at most
// 500 people + offerings. Maximum = 32 + 8 x 500 + 1 (the other collection is empty) = 4,033 rows. The cap is therefore
// locked at exactly 4,033 in the TypeScript export schema and in the SQL export contract; one more row is rejected.
// (Before this Quest it was 1,001 = 30 singleton rows + 5/7 rows per entry, which already was a cap, not a derived maximum.)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KnowledgeBaseExportSchema, createEntryDefault, validateProvenance } from "../../src/contracts";

type Json = Record<string, any>;
const root = resolve(__dirname, "../..");
const MAX_ROWS = 4033;
const AUTHOR = "40000000-0000-4000-8000-000000000001";
const SINGLETON_TARGETS = [
  ...["overview", "revenue", "website", "industry", "business_model", "company_role", "year_founded", "legal_entity_type", "employee_count", "main_address", "other_locations", "service_locations", "alternative_company_names"].map((field) => `/company_foundation/${field}`),
  "/positioning/company_pitch", "/positioning/founding_story",
  ...["target_buyers", "customer_needs", "ideal_customer_personas", "industry_groupings", "industry_outlook", "channels", "funnels", "ctas", "suppliers_and_partners"].map((field) => `/market_and_customers/${field}`),
  ...["writing_style_description", "art_style_description", "fonts", "brand_colors", "logos"].map((field) => `/branding_and_style/${field}`),
  "/online_presence/social_media_links", "/online_presence/phone", "/site_links/links",
];
const PERSON_FIELDS = ["name", "title", "role", "gender", "background_or_relevance", "age", "nationality", "portrait"];
const OFFERING_FIELDS = ["name", "description", "offering_type", "category", "features", "pricing", "url", "images"];
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A legitimate snapshot of `people` key people and `offerings` offerings, each with one name and one claim. */
function snapshotOf(people: number, offerings: number): Json {
  const business = {
    company_foundation: createEntryDefault("company_foundation"), positioning: createEntryDefault("positioning"),
    market_and_customers: createEntryDefault("market_and_customers"), branding_and_style: createEntryDefault("branding_and_style"),
    online_presence: createEntryDefault("online_presence"), site_links: createEntryDefault("site_links"),
    key_people: Array.from({ length: people }, (_, n) => ({ ...(createEntryDefault("key_person", uuid("a8000000", n + 1)) as Json), name: `Person ${n + 1}` })),
    offerings: Array.from({ length: offerings }, (_, n) => ({ ...(createEntryDefault("offering", uuid("a9000000", n + 1)) as Json), name: `Offering ${n + 1}` })),
  };
  const entries = [
    ...business.key_people.map((item: Json) => ({ entry_id: item.id, kind: "key_person", root: `/key_people/@${item.id}` })),
    ...business.offerings.map((item: Json) => ({ entry_id: item.id, kind: "offering", root: `/offerings/@${item.id}` })),
  ];
  const coverage: Json[] = [];
  const row = (target: string) => coverage.push({ targets: [target], status: "not_checked", job_id: null, reason: "Entered manually." });
  SINGLETON_TARGETS.forEach(row);
  if (people) {
    business.key_people.forEach((item: Json) => PERSON_FIELDS.forEach((field) => row(`/key_people/@${item.id}/${field}`)));
  } else {
    row("/key_people");
  }
  if (offerings) {
    business.offerings.forEach((item: Json) => OFFERING_FIELDS.forEach((field) => row(`/offerings/@${item.id}/${field}`)));
  } else {
    row("/offerings");
  }
  return {
    schema_version: "1.0.0", company_id: "10000000-0000-4000-8000-0000000000aa", knowledge_base_version_id: "10000000-0000-4000-8000-0000000000ab",
    version: 1, saved_at: "2026-10-16T05:00:00Z", ...business,
    provenance: {
      company: { name: "Maximal Co", website: "https://maximal.example/", snapshot_author_id: AUTHOR },
      entries: entries.map((entry) => ({ entry_id: entry.entry_id, kind: entry.kind, revision: 1, review_status: "approved", author_id: AUTHOR, saved_at: "2026-10-16T04:59:00Z" })),
      sources: [], evidence: [],
      claims: entries.map((entry, n) => ({ id: uuid("a7000000", n + 1), entry_id: entry.entry_id, targets: [`${entry.root}/name`], origin: "user_provided", evidence_ids: [], based_on_claim_ids: [], actor_id: AUTHOR, authored_at: "2026-10-16T04:58:00Z", note: "Entered by hand." })),
      coverage, operations: [],
    },
  };
}
const withExtraRow = (snapshot: Json, count = 1): Json => {
  const copy = structuredClone(snapshot);
  for (let n = 0; n < count; n++) {
    copy.provenance.coverage.push({ ...copy.provenance.coverage[0] });
  }
  return copy;
};
const accepted = (snapshot: Json) => KnowledgeBaseExportSchema.safeParse(snapshot).success;
const issues = (snapshot: Json) => validateProvenance({ company_foundation: snapshot.company_foundation, positioning: snapshot.positioning, market_and_customers: snapshot.market_and_customers, branding_and_style: snapshot.branding_and_style, online_presence: snapshot.online_presence, site_links: snapshot.site_links, key_people: snapshot.key_people, offerings: snapshot.offerings } as never, snapshot.provenance as never);

describe("C6 [behavioural] the export accepts a maximal legitimate snapshot (4,033 coverage rows) and rejects one row more", () => {
  it("the derivation: 32 singleton rows + 8 per person or offering + 1 for the empty collection", () => {
    expect(SINGLETON_TARGETS).toHaveLength(32);
    expect(new Set(SINGLETON_TARGETS).size).toBe(32);
    expect(32 + 8 * 500 + 1).toBe(MAX_ROWS);
    const full = snapshotOf(500, 0);
    expect(full.provenance.coverage).toHaveLength(MAX_ROWS);
    expect(full.provenance.claims).toHaveLength(500);
  }, 60_000);

  it("500 key people (4,033 rows) is a valid snapshot: schema, claims and exactly-one-coverage-per-field all hold", () => {
    const full = snapshotOf(500, 0);
    expect(accepted(full), "TypeScript export schema accepts 4,033 rows").toBe(true);
    expect(issues(full)).toEqual([]);
  }, 60_000);

  it("500 offerings (4,033 rows) and 250 + 250 (4,032 rows) are valid snapshots too", () => {
    const offerings = snapshotOf(0, 500);
    expect(offerings.provenance.coverage).toHaveLength(MAX_ROWS);
    expect(accepted(offerings)).toBe(true);
    expect(issues(offerings)).toEqual([]);
    const mixed = snapshotOf(250, 250);
    expect(mixed.provenance.coverage).toHaveLength(MAX_ROWS - 1);
    expect(accepted(mixed)).toBe(true);
    expect(issues(mixed)).toEqual([]);
  }, 60_000);

  it("Edge case: one coverage row more than the maximum (4,034) is rejected, as are far larger snapshots", () => {
    const full = snapshotOf(500, 0);
    expect(accepted(full), "valid control").toBe(true);
    expect(accepted(withExtraRow(full)), "4,034 rows").toBe(false);
    expect(accepted(withExtraRow(full, 1000)), "5,033 rows").toBe(false);
    expect(validateProvenance({ ...full, key_people: full.key_people, offerings: [] } as never, withExtraRow(full).provenance as never).map((item) => item.code)).toContain("schema");
  }, 60_000);

  it("every snapshot that fitted the old cap still fits: the old maxima, counted with the new rows, are far below 4,033", () => {
    // Old cap 1,001 rows: the largest entry mix was 194 people (5 rows) = 30 + 970 + 1 rows; with 8 rows per person that is 1,585.
    const oldMaxPeople = snapshotOf(194, 0);
    expect(oldMaxPeople.provenance.coverage).toHaveLength(32 + 194 * 8 + 1);
    expect(accepted(oldMaxPeople)).toBe(true);
    expect(issues(oldMaxPeople)).toEqual([]);
    const mixed = snapshotOf(190, 3);
    expect(mixed.provenance.coverage).toHaveLength(32 + 190 * 8 + 3 * 8);
    expect(accepted(mixed)).toBe(true);
    expect(accepted(snapshotOf(1, 1)), "a tiny snapshot").toBe(true);
  }, 60_000);

  it("the structural contract used by SQL (json-schemas.json) states the same cap of 4,033 coverage rows", () => {
    const schemas = JSON.parse(readFileSync(resolve(root, "src/contracts/json-schemas.json"), "utf8")) as Json;
    expect(schemas.export.properties.provenance.properties.coverage.maxItems).toBe(MAX_ROWS);
    expect(schemas.export_provenance.properties.coverage.maxItems).toBe(MAX_ROWS);
    // The other snapshot caps are unchanged.
    expect(schemas.export.properties.provenance.properties.claims.maxItems).toBe(500);
    expect(schemas.export.properties.provenance.properties.entries.maxItems).toBe(1000);
  });

  it("a single entry's own provenance keeps the small per-entry coverage cap (500)", () => {
    const schemas = JSON.parse(readFileSync(resolve(root, "src/contracts/json-schemas.json"), "utf8")) as Json;
    expect(schemas.provenance.properties.coverage.maxItems).toBe(500);
  });
});
