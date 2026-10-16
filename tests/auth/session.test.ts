import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn() }));
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
