// OWASP Top 10:2025 A05 Injection.
// Already covered elsewhere: a few strict-body cases in tests/api/input.test.ts, SQL-side unknown keys and
// validation in tests/db/security.test.mjs, SVG/polyglot uploads in tests/server/uploads-api.test.ts.
// This file adds: every request schema is strict, no SQL is assembled from request data, hostile text is passed
// to the database as a parameter, javascript:/data: links are not rendered, and SVG detection stays narrow.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
const state = vi.hoisted(() => ({ rpc: vi.fn(), signIn: vi.fn() }));
vi.mock("../../../src/lib/supabase/server", () => ({
  verifiedSession: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    client: { rpc: state.rpc },
  }),
  createClient: async () => ({ auth: { signInWithPassword: state.signIn } }),
}));

// The component imports through the "@/" alias, which this vitest config does not resolve; only safeHref is needed.
vi.mock("@/knowledge/apa", () => ({ formatAPACitations: () => [] }));
vi.mock("../../../src/components/shared/citation-context", () => ({ mergeCitationContexts: () => null }));

import * as companies from "../../../src/contracts/api-companies";
import * as entries from "../../../src/contracts/api-entries";
import * as scrapes from "../../../src/contracts/api-scrapes";
import * as versions from "../../../src/contracts/api-versions";
import { POST as createCompany } from "../../../src/app/api/companies/route";
import { POST as signIn } from "../../../src/app/api/auth/sign-in/route";
import { safeHref } from "../../../src/components/shared/citation-popover";
import { sniffImage } from "../../../src/server/uploads";

const ROOT = resolve(__dirname, "../../..");
const ORIGIN = "https://app.example";
const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("request bodies", () => {
  it("are strict objects, so unknown fields are rejected instead of ignored", async () => {
    const requestSchemas = Object.entries({ ...companies, ...entries, ...scrapes, ...versions }).filter(
      ([name, value]) => name.endsWith("Schema") && name !== "WebsiteSchema" && value instanceof z.ZodType,
    ) as [string, z.ZodTypeAny][];
    expect(requestSchemas.length).toBeGreaterThan(8);
    const objectsOf = (schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape>[] =>
      schema instanceof z.ZodEffects
        ? objectsOf(schema._def.schema)
        : schema instanceof z.ZodUnion
          ? (schema.options as z.ZodTypeAny[]).flatMap(objectsOf)
          : schema instanceof z.ZodObject
            ? [schema]
            : [];
    for (const [name, schema] of requestSchemas) {
      const found = objectsOf(schema);
      expect(found.length, name).toBeGreaterThan(0);
      for (const object of found) {
        expect(object._def.unknownKeys, name).toBe("strict");
      }
    }

    // ...and a rejected body never reaches the auth provider.
    process.env.APP_ORIGIN = ORIGIN;
    const response = await signIn(
      post(`${ORIGIN}/api/auth/sign-in`, { email: "a@example.com", password: "pw", role: "admin" }),
    );
    expect(response.status).toBe(400);
    expect(state.signIn).not.toHaveBeenCalled();
  });
});

describe("SQL", () => {
  it("is never built from request data: queries use fixed names and placeholders", async () => {
    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    const withQuery = sourceFiles(join(ROOT, "src")).filter((path) => readFileSync(path, "utf8").includes('.query('));
    expect(withQuery.map((path) => path.slice(ROOT.length + 1))).toEqual(["src/worker/job-repository.ts"]);
    const text = readFileSync(join(ROOT, "src/worker/job-repository.ts"), "utf8");
    // The only interpolations inside SQL text: the function name (always a string literal at the call site) and $n.
    expect(text).not.toMatch(/this\.call(?:<[^(]*>)?\(\s*(?!["'])/);
    const sql = [...text.matchAll(/\.query\(\s*`([^`]*)`/g)].map((match) => match[1]);
    expect(sql.length).toBeGreaterThan(0);
    for (const statement of sql) {
      for (const part of statement.matchAll(/\$\{([^}]*)\}/g)) {
        expect(part[1], statement).toMatch(/^(name|args\.map\(\(_, i\) => `\$\$\{i \+ 1\}`\)\.join\(","\))$/);
      }
    }

    // Hostile text goes to the database as a parameter, unchanged.
    process.env.APP_ORIGIN = ORIGIN;
    const name = "Robert'); DROP TABLE public.companies;--";
    state.rpc.mockResolvedValue({ data: "33333333-3333-4333-8333-333333333333", error: null });
    const response = await createCompany(
      post(`${ORIGIN}/api/companies`, {
        name,
        website: "https://acme.example",
        requestId: "22222222-2222-4222-8222-222222222222",
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(201);
    expect(state.rpc).toHaveBeenCalledWith("create_company", expect.objectContaining({ p_name: name }));
  });
});

describe("links and images", () => {
  it("render only http(s) links and plain SVG documents", () => {
    for (const hostile of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "//evil.example/x", "/relative"]) {
      expect(safeHref(hostile), hostile).toBeUndefined();
    }
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");

    // SVG is recognised only as a plain document, not HTML or XML with an entity subset.
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))?.type).toBe("image/svg+xml");
    expect(sniffImage(bytes('<html><body><svg/></body></html>'))).toBeNull();
    expect(sniffImage(bytes('<!DOCTYPE svg [<!ENTITY x "boom">]><svg>&x;</svg>'))).toBeNull();
  });
});
