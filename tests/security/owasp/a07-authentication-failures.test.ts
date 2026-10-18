// OWASP Top 10:2025 A07 Authentication Failures.
// Already covered elsewhere: 429/503 classification and no provider text in tests/auth/session.test.ts, the
// already-registered sign-up answer in tests/auth/sign-up*.test.ts.
// This file adds: sign-in cannot tell "no such account" from "wrong password", the sign-up error code for an
// existing account looks like a normal pending sign-up, and the password rules are enforced before the provider.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
const state = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("../../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: state.signIn, signUp: state.signUp } }),
}));

import { POST as signIn } from "../../../src/app/api/auth/sign-in/route";
import { POST as signUp } from "../../../src/app/api/auth/sign-up/route";

const APP = "https://app.example.com";
const post = (path: string, body: unknown) =>
  new Request(`${APP}/api/auth/${path}`, {
    method: "POST",
    headers: { origin: APP, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const stable = async (response: Response) => {
  const { requestId: _requestId, ...rest } = await response.json();
  return { status: response.status, body: rest };
};

describe("accounts", () => {
  it("answer sign-in alike for an unknown email, a wrong password and an unconfirmed email", async () => {
    process.env.APP_ORIGIN = APP;
    const seen = [];
    for (const [email, error] of [
      ["nobody@example.com", { status: 400, name: "AuthApiError", code: "user_not_found", message: "User not found" }],
      ["person@example.com", { status: 400, name: "AuthApiError", code: "invalid_credentials", message: "Invalid login credentials" }],
      ["pending@example.com", { status: 400, name: "AuthApiError", code: "email_not_confirmed", message: "Email not confirmed" }],
    ] as const) {
      state.signIn.mockResolvedValue({ error });
      seen.push(await stable(await signIn(post("sign-in", { email, password: "correct-horse" }))));
    }
    expect(seen[0]!.status).toBe(401);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
  });

  it("answer sign-up alike for a new and an already registered email", async () => {
    process.env.APP_ORIGIN = APP;
    const body = { email: "person@example.com", password: "correct-horse-battery" };
    state.signUp.mockResolvedValue({ data: { session: null, user: { id: "u" } }, error: null });
    const created = await stable(await signUp(post("sign-up", body)));
    state.signUp.mockResolvedValue({ data: null, error: { status: 422, name: "AuthApiError", code: "user_already_exists", message: "User already registered" } });
    expect(await stable(await signUp(post("sign-up", body)))).toEqual(created);
  });

  it("enforces password length before any call to the provider", async () => {
    process.env.APP_ORIGIN = APP;
    state.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    for (const password of ["", "short7!", "x".repeat(73)])
      expect((await signUp(post("sign-up", { email: "person@example.com", password }))).status, password.length + " chars").toBe(400);
    expect(state.signUp).not.toHaveBeenCalled();
    expect((await signUp(post("sign-up", { email: "person@example.com", password: "12345678" }))).status).toBe(200);
    expect((await signIn(post("sign-in", { email: "person@example.com", password: "" }))).status).toBe(400);
    expect(state.signIn).not.toHaveBeenCalled();
  });
});
