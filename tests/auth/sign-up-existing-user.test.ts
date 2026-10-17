import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const signUp = vi.fn();
vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp } }),
}));

const APP = "https://app.example.com";

describe("sign-up with an already-registered email", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = APP;
    signUp.mockReset();
  });

  it("answers like a new account awaiting confirmation", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 422, name: "AuthApiError", code: "user_already_exists", message: "User already registered" },
    });
    const { POST } = await import("../../src/app/api/auth/sign-up/route");
    const res = await POST(
      new Request(`${APP}/api/auth/sign-up`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP },
        body: JSON.stringify({ email: "taken@example.com", password: "correct horse" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ signedUp: true, signedIn: false });
  });
});
