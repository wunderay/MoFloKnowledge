import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
const state = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: state.signUp } }),
}));

// The pages import components through the "@/" tsconfig alias, which this
// vitest config does not resolve. Stub those leaf components so the page
// markup itself (headings, links) can be rendered and inspected.
vi.mock("@/components/icons", () => ({ CloudBrand: () => null }));
vi.mock("@/components/sign-in-form", () => ({
  SignInForm: () => createElement("form", null, createElement("input", { name: "email" })),
}));
vi.mock("@/components/sign-up-form", () => ({
  SignUpForm: () => createElement("form", null, createElement("input", { name: "email" })),
}));

const APP = "https://app.example.com";

function signUpRequest(origin = APP) {
  return new Request(`${APP}/api/auth/sign-up`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      email: "person@example.com",
      password: "correct-horse-battery",
      confirmPassword: "correct-horse-battery",
    }),
  });
}

async function loadSignUpPost() {
  const mod = await import("../../src/app/api/auth/sign-up/route").catch(
    () => null,
  );
  expect(mod).not.toBeNull();
  return mod!.POST as (request: Request) => Promise<Response>;
}

function stubEnv() {
  process.env.APP_ORIGIN = APP;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.com";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-only";
}

it("returns signedIn:true and requests the callback redirect when signUp yields a session", async () => {
  stubEnv();
  state.signUp.mockResolvedValue({
    data: { session: { access_token: "x" }, user: { id: "u1" } },
    error: null,
  });
  const POST = await loadSignUpPost();
  const response = await POST(signUpRequest());
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({
    signedUp: true,
    signedIn: true,
  });
  expect(state.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "person@example.com",
      password: "correct-horse-battery",
      options: expect.objectContaining({
        emailRedirectTo: `${APP}/auth/callback`,
      }),
    }),
  );
});

it("returns signedIn:false when signUp yields no session", async () => {
  stubEnv();
  state.signUp.mockResolvedValue({
    data: { session: null, user: { id: "u2" } },
    error: null,
  });
  const POST = await loadSignUpPost();
  const response = await POST(signUpRequest());
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({
    signedUp: true,
    signedIn: false,
  });
});

it("gives an already-registered email the same no-session answer", async () => {
  stubEnv();
  state.signUp.mockResolvedValue({
    data: { session: null, user: { id: "existing", identities: [] } },
    error: null,
  });
  const POST = await loadSignUpPost();
  const response = await POST(signUpRequest());
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({
    signedUp: true,
    signedIn: false,
  });
});

it("maps a provider 429 to 429 without leaking provider details", async () => {
  stubEnv();
  state.signUp.mockResolvedValue({
    data: { session: null, user: null },
    error: {
      status: 429,
      name: "AuthApiError",
      message: "private provider details",
    },
  });
  const POST = await loadSignUpPost();
  const response = await POST(signUpRequest());
  expect(response.status).toBe(429);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private provider details",
  );
});

it("maps a retryable provider failure to 503 without leaking provider details", async () => {
  stubEnv();
  state.signUp.mockResolvedValue({
    data: { session: null, user: null },
    error: {
      status: 0,
      name: "AuthRetryableFetchError",
      message: "private provider details",
    },
  });
  const POST = await loadSignUpPost();
  const response = await POST(signUpRequest());
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private provider details",
  );
});

it("refuses a write from a foreign origin before calling the provider", async () => {
  stubEnv();
  const POST = await loadSignUpPost();
  const response = await POST(signUpRequest("https://evil.example.net"));
  expect(response.status).toBe(403);
  expect(state.signUp).not.toHaveBeenCalled();
});

it("renders /sign-up with the create-account form and a link back to sign-in", async () => {
  const mod = await import("../../src/app/sign-up/page").catch(() => null);
  expect(mod).not.toBeNull();
  const html = renderToStaticMarkup(
    createElement(mod!.default as () => ReturnType<typeof createElement>),
  );
  expect(html).toContain("Create your account");
  expect(html).toContain('name="email"');
  expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>[^<]*Sign in[^<]*<\/a>/);
});

it("links the sign-in page to /sign-up", async () => {
  const mod = await import("../../src/app/sign-in/page").catch(() => null);
  expect(mod).not.toBeNull();
  const html = renderToStaticMarkup(
    createElement(mod!.default as () => ReturnType<typeof createElement>),
  );
  expect(html).toMatch(
    /<a[^>]*href="\/sign-up"[^>]*>[^<]*Create an account[^<]*<\/a>/,
  );
});
