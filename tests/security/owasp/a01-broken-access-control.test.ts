// OWASP Top 10:2025 A01 Broken Access Control (includes SSRF).
// Already covered elsewhere, not repeated here: per-route role/membership cases in tests/server/uploads-*.test.ts and
// entry-delete-route.test.ts, the egress proxy and pinned transport in tests/security/*.test.ts, RLS and cross-company
// SQL in tests/db/security.test.mjs and tests/db/owasp.test.mjs.
// This file adds the one sweep over every API route, the role matrix of authorizeCompany, and SSRF input checks.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("../../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({ user: null, client: {} }),
  createClient: async () => ({ auth: {} }),
}));

import { authorizeCompany } from "../../../src/server/authorize";
import { mapDatabaseError } from "../../../src/server/http";
import { normalizeUrl } from "../../../src/worker/network/url-scope";
import { approveDestination } from "../../../src/worker/network/destination-policy";
import { WebsiteSchema } from "../../../src/contracts/api-companies";
import { RenderTaskSchema } from "../../../src/contracts/render-task";

const API_ROOT = resolve(__dirname, "../../../src/app/api");
const ORIGIN = "https://app.example";
// Sign-in and sign-up are the only routes that run before a session exists.
const PUBLIC_ROUTES = ["auth/sign-in/route.ts", "auth/sign-up/route.ts"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? routeFiles(join(dir, entry.name))
      : entry.name === "route.ts"
        ? [join(dir, entry.name)]
        : [],
  );
}

describe("every API route", () => {
  it("refuses a foreign origin on writes and a signed-out caller everywhere", async () => {
    process.env.APP_ORIGIN = ORIGIN;
    const files = routeFiles(API_ROOT);
    expect(files.length).toBeGreaterThan(20);
    let handlers = 0;
    for (const file of files) {
      const name = file.slice(API_ROOT.length + 1);
      const mod = (await import(file)) as Record<string, unknown>;
      const context = { params: Promise.resolve({}) };
      for (const method of METHODS) {
        const handler = mod[method] as
          | ((request: Request, context: unknown) => Promise<Response>)
          | undefined;
        if (!handler) {
          continue;
        }
        handlers++;
        const url = `${ORIGIN}/api/${name}`;
        if (method !== "GET") {
          const forged = await handler(
            new Request(url, {
              method,
              headers: { origin: "https://evil.example", "content-type": "application/json" },
              body: "{}",
            }),
            context,
          );
          expect(forged.status, `${method} ${name} foreign origin`).toBe(403);
        }
        if (PUBLIC_ROUTES.includes(name)) {
          continue;
        }
        const anonymous = await handler(
          new Request(url, {
            method,
            headers: { origin: ORIGIN, "content-type": "application/json" },
            ...(method === "GET" ? {} : { body: "{}" }),
          }),
          context,
        );
        expect(anonymous.status, `${method} ${name} signed out`).toBe(401);
      }
    }
    expect(handlers).toBeGreaterThan(30);
  });
});

describe("company roles", () => {
  const client = (role: string | null) =>
    ({
      from: () => {
        const query: Record<string, unknown> = {};
        query.select = query.eq = () => query;
        query.maybeSingle = async () => ({ data: role ? { role } : null, error: null });
        return query;
      },
    }) as never;
  const id = "10000000-0000-4000-8000-000000000001";

  it("hides the company from non-members, keeps viewers read-only and maps database refusals to 403 and 404", async () => {
    await expect(authorizeCompany(client(null), id, id)).rejects.toMatchObject({ status: 404 });
    await expect(authorizeCompany(client("viewer"), id, id, true)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeCompany(client("editor"), id, id, true, true)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeCompany(client("viewer"), id, id)).resolves.toBe("viewer");
    await expect(authorizeCompany(client("editor"), id, id, true)).resolves.toBe("editor");
    await expect(authorizeCompany(client("owner"), id, id, true, true)).resolves.toBe("owner");
    expect(mapDatabaseError({ message: "insufficient_role" }).status).toBe(403);
    expect(mapDatabaseError({ message: "owner_required" }).status).toBe(403);
    expect(mapDatabaseError({ message: "not_member" }).status).toBe(404);
  });
});

describe("SSRF", () => {
  it("refuses non-http schemes, credentials, odd ports and every spelling of a loopback or metadata address", () => {
    for (const input of [
      "file:///etc/passwd",
      "ftp://example.com/",
      "gopher://example.com/",
      "data:text/html,hi",
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- intentionally fake credentials: the SSRF check must reject them
      "http://user:pass@example.com/",
      "http://example.com:8080/",
      "http://localhost/",
      "http://service.localhost/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://0x7f.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "http://metadata/",
    ]) {
      expect(() => normalizeUrl(input), input).toThrow();
    }
  });

  it("refuses names that resolve to cloud metadata or private addresses, including IPv6 and mixed answers", async () => {
    const answer = (...addresses: string[]) => async (): Promise<{ address: string; family: 4 | 6 }[]> =>
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    for (const address of ["169.254.169.254", "100.100.100.200", "fd00:ec2::254", "::ffff:169.254.169.254", "192.168.1.10"]) {
      await expect(approveDestination("https://metadata.example.com/", answer(address)), address).rejects.toThrow();
    }
    await expect(approveDestination("https://example.com/", answer("93.184.216.34", "10.0.0.5"))).rejects.toThrow();
    await expect(approveDestination("https://example.com/", answer())).rejects.toThrow();
  });

  it("applies the same rules at the API boundary and to renderer tasks", () => {
    for (const website of ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "http://user:pw@example.com", "http://example.com:8080"]) {
      expect(WebsiteSchema.safeParse(website).success, website).toBe(false);
    }
    expect(WebsiteSchema.safeParse("https://example.com").success).toBe(true);
    const task = (url: string, scope: string[]) => RenderTaskSchema.safeParse({ url, scope });
    expect(task("https://example.com/", ["example.com"]).success).toBe(true);
    expect(task("http://169.254.169.254/", ["169.254.169.254"]).success).toBe(false);
    expect(task("https://example.com/", ["evil.example"]).success).toBe(false);
  });
});
