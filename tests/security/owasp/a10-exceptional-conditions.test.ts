// OWASP Top 10:2025 A10 Mishandling of Exceptional Conditions.
// Already covered elsewhere: database error mapping and signed-out envelope in tests/server/http.test.ts, provider
// 429/503 handling in tests/auth/session.test.ts and tests/auth/sign-up.test.ts, storage errors in tests/server/uploads-*.test.ts.
// This file adds: an unexpected exception inside any route handler becomes a fixed 503 (no message, stack or paths),
// every error carries a requestId, and failures of the auth check, configuration or request parsing fail closed.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
const state = vi.hoisted(() => ({ verified: vi.fn(), createClient: vi.fn() }));
vi.mock("../../../src/lib/supabase/server", () => ({
  verifiedSession: state.verified,
  createClient: state.createClient,
}));

import { route, readJson } from "../../../src/server/http";
import { POST as signIn } from "../../../src/app/api/auth/sign-in/route";

const ORIGIN = "https://app.example";
const request = (init: RequestInit = {}) =>
  new Request(`${ORIGIN}/api/x`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}", ...init });
const context = { params: Promise.resolve({}) };
const signedIn = { user: { id: "u" }, client: {} };

describe("unexpected failures", () => {
  it("never show the exception, its stack or file paths, and always carry a requestId", async () => {
    process.env.APP_ORIGIN = ORIGIN;
    state.verified.mockResolvedValue(signedIn);
    const boom = new Error("ECONNREFUSED 10.0.0.5:5432 password=hunter2");
    const bodies: string[] = [];
    for (const failure of [boom, new TypeError("x is undefined"), new z.ZodError([]), "plain string", null]) {
      const response = await route(async () => {
        throw failure;
      })(request(), context);
      expect([400, 503]).toContain(response.status);
      const text = await response.text();
      bodies.push(text);
      const body = JSON.parse(text);
      expect(body.data).toBeNull();
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
    }
    expect(bodies.join()).not.toMatch(/hunter2|ECONNREFUSED|undefined|stack|\bat \S+:\d+|node_modules|\/src\//);
  });

  it("sign-in answers a thrown error with a fixed message", async () => {
    state.createClient.mockRejectedValue(new Error("SUPABASE_NOT_CONFIGURED /srv/app/.env"));
    const response = await signIn(request({ body: JSON.stringify({ email: "a@example.com", password: "pw" }) }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/SUPABASE|\/srv/);
  });
});

describe("failing closed", () => {
  it("runs no handler when the origin is not configured, the session check fails, or the body is not JSON", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    state.verified.mockResolvedValue(signedIn);

    delete process.env.APP_ORIGIN;
    expect((await route(handler)(request(), context)).status).toBe(503);
    process.env.APP_ORIGIN = ORIGIN;

    state.verified.mockRejectedValue(new Error("Authentication service is temporarily unavailable."));
    expect((await route(handler)(request(), context)).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();

    state.verified.mockResolvedValue(signedIn);
    await expect(readJson(request({ headers: { "content-type": "text/plain" } }), z.object({}))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request({ body: "{not json" }), z.object({}))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request({ body: "" }), z.object({}))).rejects.toMatchObject({ status: 400 });
  });
});
