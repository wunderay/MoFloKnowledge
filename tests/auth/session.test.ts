import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  create: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: state.signIn } }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: state.create }));
import { refreshSession } from "../../src/lib/supabase/middleware";
it("persists refreshed HttpOnly cookies before a verified server read", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.com";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-only";
  state.create.mockImplementation((_url, _key, options) => ({
    auth: {
      getUser: state.getUser.mockImplementation(async () => {
        options.cookies.setAll([
          {
            name: "session",
            value: "new-session",
            options: options.cookieOptions,
          },
        ]);
        return { data: { user: { id: "verified" } }, error: null };
      }),
    },
  }));
  const request = new NextRequest("https://app.example.com/dashboard");
  const response = await refreshSession(request);
  expect(state.getUser).toHaveBeenCalledOnce();
  expect(request.cookies.get("session")?.value).toBe("new-session");
  expect(response.cookies.get("session")).toMatchObject({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    value: "new-session",
  });
});

import { POST as signIn } from "../../src/app/api/auth/sign-in/route";
it.each([
  [{ status: 400, name: "AuthApiError" }, 401],
  [{ status: 429, name: "AuthApiError" }, 429],
  [{ status: 503, name: "AuthApiError" }, 503],
  [{ status: 0, name: "AuthRetryableFetchError" }, 503],
])(
  "classifies sign-in failure %j without disclosing provider details",
  async (error, expected) => {
    process.env.APP_ORIGIN = "https://app.example.com";
    state.signIn.mockResolvedValue({
      error: { ...error, message: "private provider details" },
    });
    const response = await signIn(
      new Request("https://app.example.com/api/auth/sign-in", {
        method: "POST",
        headers: {
          origin: "https://app.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "person@example.com",
          password: "password",
        }),
      }),
    );
    expect(response.status).toBe(expected);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private provider details",
    );
  },
);
