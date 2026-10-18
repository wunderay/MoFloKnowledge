import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("deploy switch", () => {
  it("is a boolean", () => {
    const config = JSON.parse(read("deploy/deploy.json")) as { enabled: unknown };
    expect(typeof config.enabled).toBe("boolean");
  });

  it("gates every deploy job on the switch", () => {
    const workflow = read(".github/workflows/deploy.yml");
    for (const job of ["migrate", "web", "worker"]) {
      const block = new RegExp(`^  ${job}:\\n(?:(?: {4}.*)?\\n)+`, "m").exec(workflow)?.[0];
      expect(block, job).toContain("needs: ");
      expect(block, job).toContain("if: needs.gate.outputs.enabled == 'true'");
    }
  });

  it("documents every secret the workflow uses", () => {
    const names = new Set(
      [...read(".github/workflows/deploy.yml").matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map(
        (match) => match[1],
      ),
    );
    expect(names.size).toBeGreaterThan(0);
    const doc = read("docs/deploy.md");
    for (const name of names) {
      expect(doc, name).toContain(`\`${name}\``);
    }
  });
});
