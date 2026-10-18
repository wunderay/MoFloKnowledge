// OWASP Top 10:2025 A04 Cryptographic Failures.
// The app keeps no passwords or key material of its own (Supabase Auth does), so this covers what it can get wrong:
// secrets leaking into browser-visible config, cookies sent over plain HTTP, and weak shared tokens between services.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
const state = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: state.create }));

import { createClient } from "../../../src/lib/supabase/server";
import { createEgressProxy } from "../../../src/egress/proxy";
import { createTaskServer } from "../../../src/renderer/task-server";

const ROOT = resolve(__dirname, "../../..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mjs|json)$/.test(name) ? [path] : [];
  });
}

describe("secrets and transport", () => {
  it("exposes only the two Supabase public settings to the browser and embeds no key material", () => {
    const sources = [...files(join(ROOT, "src")), join(ROOT, ".env.example"), join(ROOT, "next.config.ts"), join(ROOT, ".github/workflows/ci.yml")];
    const names = new Set<string>();
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        names.add(match[0]);
      }
      expect(text, path).not.toMatch(/sb_secret_|-----BEGIN [A-Z ]*PRIVATE KEY-----|service_role|eyJ[A-Za-z0-9_-]{20,}\.eyJ/);
      // Client components can only see NEXT_PUBLIC_* values; any other process.env read there is a leak or a bug.
      if (/^["']use client["']/.test(text)) {
        expect(text, path).not.toMatch(/process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)/);
      }
    }
    expect([...names].sort()).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });

  it("marks session cookies Secure in production", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-only";
    state.create.mockReturnValue({ auth: {} });
    vi.stubEnv("NODE_ENV", "production");
    try {
      await createClient();
    } finally {
      vi.unstubAllEnvs();
    }
    expect(state.create.mock.calls[0][2].cookieOptions).toMatchObject({ secure: true, httpOnly: true });
  });

  it("refuses to start the internal renderer and proxy with a short shared token", () => {
    expect(() => createEgressProxy({ token: "short" })).toThrow();
    expect(() => createTaskServer("short", async () => ({}) as never)).toThrow();
    expect(() => createEgressProxy({ token: "t".repeat(32) }).close()).not.toThrow();
  });
});
