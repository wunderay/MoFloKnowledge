// Non-locked hardening tests for Quest Q6: bounded chunked bodies, zero-row delete, archived-mid-request and the
// middleware matcher that keeps the upload routes out of Next's 10 MiB middleware body buffer.
import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Next vendors its matcher compiler without type declarations.
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import {
  APP_ORIGIN,
  IDS,
  MiB,
  arrange,
  collectionContext,
  formFor,
  itemContext,
  itemRequest,
  needCollection,
  needItem,
  payload,
  png,
  readBody,
  upload,
  world,
} from "../helpers/uploads-world";
import { config } from "../../src/middleware";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("../../src/lib/supabase/server", async () => {
  const { world } = await import("../helpers/uploads-world");
  return { verifiedSession: async () => world.session(), createClient: async () => world.client };
});
vi.mock("@supabase/ssr", async () => {
  const { world } = await import("../helpers/uploads-world");
  return { createServerClient: () => world.client, createBrowserClient: () => world.client };
});
vi.mock("@supabase/supabase-js", async () => {
  const { world } = await import("../helpers/uploads-world");
  return { createClient: () => world.client };
});

let a: string;
beforeEach(() => {
  ({ a } = arrange());
});

/** A request with a streamed (chunked) body and no Content-Length. */
function chunked(companyId: string, chunks: () => Generator<Uint8Array>, contentType: string, pulled: { count: number }) {
  const iterator = chunks();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = iterator.next();
      if (next.done) {
        controller.close();
      } else {
        pulled.count += 1;
        controller.enqueue(next.value);
      }
    },
  });
  return new Request(`${APP_ORIGIN}/api/companies/${companyId}/uploads`, {
    method: "POST",
    headers: { origin: APP_ORIGIN, "content-type": contentType },
    body,
    duplex: "half",
  } as RequestInit);
}

describe("bounded request body", () => {
  it("a chunked body with no Content-Length is cut off at 11 MiB with 413 'Max 10MB' and stores nothing", async () => {
    const { POST } = await needCollection();
    const pulled = { count: 0 };
    function* endless() {
      const block = new Uint8Array(MiB);
      for (let i = 0; i < 1000; i += 1) {
        yield block;
      }
    }
    const request = chunked(a, endless, "multipart/form-data; boundary=x", pulled);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await POST(request, collectionContext(a));
    const body = await readBody(response);
    expect(response.status).toBe(413);
    expect(body.text).toContain("Max 10MB");
    expect(pulled.count, "the stream must not be drained").toBeLessThanOrEqual(14);
    expect(world.mutations()).toEqual([]);
  });

  it("a chunked multipart upload under the cap still works", async () => {
    const { POST } = await needCollection();
    const source = new Response(formFor({ file: { bytes: png(), name: "a.png", mime: "image/png" }, kind: "logos" }));
    const bytes = new Uint8Array(await source.arrayBuffer());
    const pulled = { count: 0 };
    function* pieces() {
      for (let i = 0; i < bytes.length; i += 50) {
        yield bytes.subarray(i, i + 50);
      }
    }
    const response = await POST(chunked(a, pieces, source.headers.get("content-type")!, pulled), collectionContext(a));
    const body = await readBody(response);
    expect(response.status, body.text).toBe(201);
    expect(world.objects.size).toBe(1);
  });
});

describe("delete and archive races", () => {
  it("DELETE answers 404 unavailable when the metadata row was already gone by the time it is deleted", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    const storage = world.client.storage as { from: (bucket: string) => Record<string, (...args: unknown[]) => Promise<unknown>> };
    const original = storage.from;
    storage.from = (bucket: string) => {
      const real = original(bucket);
      return {
        ...real,
        remove: async (...args: unknown[]) => {
          const result = await real.remove(...args);
          world.tables.uploads = (world.tables.uploads ?? []).filter((row) => row.id !== target.id);
          return result;
        },
      };
    };
    try {
      const { DELETE } = await needItem();
      const response = await DELETE(itemRequest("DELETE", a, target.id), itemContext(a, target.id));
      const body = await readBody(response);
      expect(response.status).toBe(404);
      expect(body.json.error.code).toBe("unavailable");
    } finally {
      storage.from = original;
    }
  });

  it("a storage refusal after the company was archived mid-request is 422, not 503", async () => {
    world.storageFailures.set("upload", { message: "new row violates row-level security policy" });
    const original = world.client.from as (table: string) => unknown;
    world.client.from = (table: string) => {
      if (table === "companies") {
        for (const row of world.tables.companies) {
          if (row.id === a) {
            row.archived_at = "2026-10-01T00:00:00.000Z";
          }
        }
      }
      return original(table);
    };
    // The first read (before the upload) must still see a live company; archive only after the upload attempt.
    let reads = 0;
    world.client.from = (table: string) => {
      if (table === "companies" && (reads += 1) === 2) {
        for (const row of world.tables.companies) {
          if (row.id === a) {
            row.archived_at = "2026-10-01T00:00:00.000Z";
          }
        }
      }
      return original(table);
    };
    try {
      const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
      expect(result.response.status, result.text).toBe(422);
      expect(payload(result.json)).toBeDefined();
    } finally {
      world.client.from = original;
    }
  });
});

describe("middleware matcher", () => {
  const matches = (path: string) => config.matcher.some((pattern) => pathToRegexp(pattern).test(path));
  it("still covers the pages and every other company API route", () => {
    for (const path of ["/dashboard", "/knowledge/view", "/api/companies", `/api/companies/${IDS.owner}`, `/api/companies/${IDS.owner}/draft`, `/api/companies/${IDS.owner}/entries/x/history`, `/api/companies/${IDS.owner}/uploads-x`]) {
      expect(matches(path), path).toBe(true);
    }
  });
  it("leaves both upload routes out, so Next does not truncate bodies at 10 MiB", () => {
    for (const path of [`/api/companies/${IDS.owner}/uploads`, `/api/companies/${IDS.owner}/uploads/${IDS.viewer}`]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
