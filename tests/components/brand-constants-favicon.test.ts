import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const BRAND_FILE = join(SRC, "lib", "brand.ts");

async function loadBrand() {
  const mod = await import("../../src/lib/brand").catch(() => null);
  expect(mod).not.toBeNull();
  return mod as unknown as Record<string, unknown>;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

it("brand.ts exports the four brand constants with the given values", async () => {
  const brand = await loadBrand();
  expect(brand.APP_NAME).toBe("MoFlo Knowledge");
  expect(brand.APP_NAME_PRIMARY).toBe("MoFlo");
  expect(brand.APP_NAME_SECONDARY).toBe("Knowledge");
  expect(brand.TAGLINE).toBe("Company knowledge, grounded in evidence.");
});

it('no src .ts/.tsx file other than src/lib/brand.ts contains the literal "MoFlo Knowledge"', async () => {
  const files = await walk(SRC);
  const offenders: string[] = [];
  for (const file of files) {
    if (file === BRAND_FILE) continue;
    const text = await readFile(file, "utf8");
    if (text.includes("MoFlo Knowledge")) {
      offenders.push(relative(SRC, file));
    }
  }
  expect(offenders).toEqual([]);
});

it("layout metadata title uses APP_NAME", async () => {
  const brand = await loadBrand();
  const layout = await import("../../src/app/layout").catch(() => null);
  expect(layout).not.toBeNull();
  const title = (layout as unknown as { metadata: { title: { default: string; template: string } } })
    .metadata.title;
  expect(title.default).toBe(brand.APP_NAME);
  expect(title.template).toContain(brand.APP_NAME as string);
});

it('src/app/icon.svg exists and contains an <svg> with the accent color #3865ff', async () => {
  const svg = await readFile(join(SRC, "app", "icon.svg"), "utf8").catch(() => null);
  expect(svg).not.toBeNull();
  expect(svg).toMatch(/<svg[\s>]/);
  expect(svg!.toLowerCase()).toContain("#3865ff");
});

it('src/app/manifest.ts default export returns name APP_NAME, short_name APP_NAME_PRIMARY and an icon at "/icon.svg"', async () => {
  const brand = await loadBrand();
  const mod = await import("../../src/app/manifest").catch(() => null);
  expect(mod).not.toBeNull();
  const manifest = (mod as unknown as { default: () => {
    name?: string;
    short_name?: string;
    icons?: Array<{ src: string }>;
  } }).default();
  expect(manifest.name).toBe(brand.APP_NAME);
  expect(manifest.short_name).toBe(brand.APP_NAME_PRIMARY);
  expect(manifest.icons?.some((icon) => icon.src === "/icon.svg")).toBe(true);
});
