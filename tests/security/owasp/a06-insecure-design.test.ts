// OWASP Top 10:2025 A06 Insecure Design.
// Already covered elsewhere: upload size boundaries per kind and chunked-body cut-off in tests/server/uploads-api.test.ts and
// uploads-hardening.test.ts, the 1 MiB JSON cap in tests/server/http.test.ts, the database-side rate limit in tests/db/owasp.test.mjs.
// This file adds: the design limits as a table (so loosening one is a visible change), 429 handling for rate-limited
// actions, and the renderer task channel's size cap.
import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    client: { rpc: state.rpc },
  }),
}));

import { POST as enqueue } from "../../../src/app/api/companies/[companyId]/scrapes/route";
import { TYPE_BY_EXTENSION, UPLOAD_KINDS, MAX_REQUEST_BYTES, limitFor } from "../../../src/server/uploads";
import { EnqueueSchema } from "../../../src/contracts/api-scrapes";
import { createTaskServer } from "../../../src/renderer/task-server";

const MiB = 1024 * 1024;
const ORIGIN = "https://app.example";
const ID = "22222222-2222-4222-8222-222222222222";

describe("design limits", () => {
  it("keep uploads to small images of a known kind and crawls to a bounded size", () => {
    expect(UPLOAD_KINDS.sort()).toEqual(["logos", "offering-images", "portraits"]);
    expect([limitFor("logos"), limitFor("portraits"), limitFor("offering-images")]).toEqual([10 * MiB, 5 * MiB, 5 * MiB]);
    expect(MAX_REQUEST_BYTES).toBeLessThanOrEqual(11 * MiB);
    expect(Object.keys(TYPE_BY_EXTENSION).sort()).toEqual(["gif", "jpeg", "jpg", "png", "svg", "webp"]);
    const crawl = (options: object) => EnqueueSchema.safeParse({ url: "https://acme.example", requestId: ID, options }).success;
    expect(crawl({ documentLimit: 25, depthLimit: 3 })).toBe(true);
    expect(crawl({ documentLimit: 26 })).toBe(false);
    expect(crawl({ depthLimit: 4 })).toBe(false);
  });

  it("tell the caller to wait when the database rate-limits a crawl", async () => {
    process.env.APP_ORIGIN = ORIGIN;
    state.rpc.mockResolvedValue({ data: null, error: { message: "rate_limited" } });
    const response = await enqueue(
      new Request(`${ORIGIN}/api/companies/${ID}/scrapes`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ url: "https://acme.com", requestId: ID }),
      }),
      { params: Promise.resolve({ companyId: ID }) },
    );
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("rate_limited");
  });

  it("makes the renderer reject unauthenticated and oversized tasks without rendering", async () => {
    const token = "t".repeat(32);
    const render = vi.fn();
    const server = createTaskServer(token, render);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as { port: number };
    try {
      const call = (headers: Record<string, string>, body: string) =>
        fetch(`http://127.0.0.1:${port}/render`, { method: "POST", headers, body });
      expect((await call({}, "{}")).status).toBe(401);
      const big = JSON.stringify({ url: "https://acme.example/", scope: ["acme.example"], pad: "x".repeat(17 * 1024) });
      expect((await call({ authorization: `Bearer ${token}` }, big)).status).toBe(422);
      expect(render).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
