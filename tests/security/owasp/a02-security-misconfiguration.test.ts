// OWASP Top 10:2025 A02 Security Misconfiguration.
// Already covered elsewhere: HttpOnly refresh cookies in tests/auth/session.test.ts, upload response headers
// (nosniff, sandbox CSP) in tests/server/uploads-serve-delete.test.ts, write-origin happy path in tests/server/http.test.ts.
// This file adds: origin-check variants, no-store on auth responses, cookie flags of the server client,
// no framework banner, and the (missing) global security headers.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
const state = vi.hoisted(() => ({ create: vi.fn(), signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: state.create }));

import nextConfig from "../../../next.config";
import { assertWriteOrigin } from "../../../src/server/http";
import { createClient } from "../../../src/lib/supabase/server";
import { POST as signIn } from "../../../src/app/api/auth/sign-in/route";
import { POST as signUp } from "../../../src/app/api/auth/sign-up/route";

const APP = "https://app.example.com";

describe("write-origin check", () => {
  it("rejects a missing, lookalike or different-scheme Origin on every unsafe method", () => {
    process.env.APP_ORIGIN = APP;
    const write = (method: string, origin?: string) =>
      assertWriteOrigin(new Request(`${APP}/api/x`, { method, headers: origin ? { origin } : {} }));
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(() => write(method), `${method} without Origin`).toThrow();
      expect(() => write(method, "https://app.example.com.evil.example")).toThrow();
      expect(() => write(method, "http://app.example.com")).toThrow();
      expect(() => write(method, "null")).toThrow();
      expect(() => write(method, APP)).not.toThrow();
    }
    expect(() => write("GET")).not.toThrow();
  });
});

describe("auth responses", () => {
  const post = (path: string, body: unknown, origin = APP) =>
    new Request(`${APP}/api/auth/${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("are never cacheable, on success and on every failure", async () => {
    process.env.APP_ORIGIN = APP;
    state.create.mockReturnValue({ auth: { signInWithPassword: state.signIn, signUp: state.signUp } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-only";
    const credentials = { email: "person@example.com", password: "correct-horse-battery" };
    const responses = [
      (state.signIn.mockResolvedValue({ error: null }), await signIn(post("sign-in", credentials))),
      (state.signIn.mockResolvedValue({ error: { status: 400, name: "AuthApiError" } }), await signIn(post("sign-in", credentials))),
      await signIn(post("sign-in", credentials, "https://evil.example")),
      await signIn(post("sign-in", { ...credentials, extra: 1 })),
      (state.signUp.mockResolvedValue({ data: { session: null }, error: null }), await signUp(post("sign-up", credentials))),
      await signUp(post("sign-up", credentials, "https://evil.example")),
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 401, 403, 400, 200, 403]);
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });
});

describe("configuration", () => {
  it("sets session cookies HttpOnly and SameSite=Lax, and does not advertise the framework", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-only";
    state.create.mockReturnValue({ auth: {} });
    await createClient();
    expect(state.create.mock.calls[0][2].cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  // KNOWN GAP: neither next.config.ts nor the middleware sets X-Frame-Options / frame-ancestors, X-Content-Type-Options,
  // Referrer-Policy, Strict-Transport-Security or a Content-Security-Policy on pages. Only the upload and document routes
  // set their own headers. Remove `.fails` when headers() is added.
  it.fails("sends clickjacking and MIME-sniffing protection headers on pages", async () => {
    const rules = await nextConfig.headers!();
    const keys = rules.flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()));
    expect(keys).toContain("x-content-type-options");
    expect(keys.some((key) => key === "x-frame-options" || key === "content-security-policy")).toBe(true);
  });
});
