import { afterEach, expect, it, vi } from "vitest";
import { ApiError, api, errorMessage } from "../../src/components/shared/api-client";

afterEach(() => vi.unstubAllGlobals());

it("reports a non-JSON error response as a failed request", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
  const failure = await api("/x").catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(ApiError);
  expect(errorMessage(failure)).toBe("The request could not be completed.");
});

it("words a stale revision (409) as a reload prompt", () => {
  expect(errorMessage(new ApiError("stale", 409))).toMatch(/^This value changed since the page was loaded\./);
  expect(errorMessage(new ApiError("nope", 400))).toBe("nope");
});
