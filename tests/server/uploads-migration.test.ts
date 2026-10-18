// Static half: the repository must carry a NEW
// migration (after 0017) that provisions the private `knowledge-assets` bucket and its storage.objects policies.
// The behaviour of those policies is proven against PostgreSQL in tests/db/storage-uploads.test.mjs.
//
// Only a migration file numbered above 0017 that mentions the bucket is required; the DB test applies every file in order.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(directory).filter((f) => f.endsWith(".sql")).sort();
const added = files.filter((f) => Number(f.split("_")[0]) > 17);
const storageMigrations = added.filter((f) => readFileSync(new URL(f, directory), "utf8").includes("knowledge-assets"));
const sql = storageMigrations.map((f) => readFileSync(new URL(f, directory), "utf8")).join("\n");

describe("migration (static)", () => {
  it("a new migration after 0017 creates the knowledge-assets bucket", () => {
    expect(storageMigrations.length, `migrations after 0017: ${added.join(", ") || "none"}`).toBeGreaterThanOrEqual(1);
    expect(storageMigrations[0]).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    expect(sql).toMatch(/storage\.buckets/i);
  });

  it("the bucket is created private and the migration defines storage.objects policies tied to company membership", () => {
    expect(sql).toMatch(/storage\.objects/i);
    expect(sql).toMatch(/create\s+policy/i);
    expect(sql).toMatch(/company_members|company_role/i);
    expect(sql).not.toMatch(/public\s*(=|,)?\s*true/i);
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
  });

  it("earlier migrations are untouched: 0001 through 0017 still exist", () => {
    for (let n = 1; n <= 17; n += 1) {
      expect(files.some((f) => f.startsWith(String(n).padStart(4, "0") + "_")), `migration ${n}`).toBe(true);
    }
  });
});
