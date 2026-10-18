// OWASP Top 10:2025 A03 Software Supply Chain Failures.
// The vulnerability scan itself is a CI step (`npm audit --omit=dev --audit-level=high` in .github/workflows/ci.yml),
// not a unit test: it needs the network and changes with the advisory database. These tests only keep the inputs honest.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, "../../..", path), "utf8");

describe("supply chain", () => {
  it("installs from the lockfile and audits runtime dependencies in every CI run", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/- run: npm ci\b/);
    expect(ci).not.toMatch(/npm install\b/);
    expect(ci).toMatch(/npm audit --omit=dev --audit-level=high/);
    expect(JSON.parse(read("package-lock.json")).lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it("pins every dependency to an exact registry version", () => {
    const manifest = JSON.parse(read("package.json"));
    const all = { ...manifest.dependencies, ...manifest.devDependencies };
    expect(Object.keys(all).length).toBeGreaterThan(10);
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
