// Item route: SVG safety and serving headers, serving, delete, and tenant isolation, origin, role,
// archived company and path traversal.
//   GET|DELETE src/app/api/companies/[companyId]/uploads/<uploadId>/route.ts
// Objects are seeded straight into the in-memory storage world (tests/helpers/uploads-world.ts) so that serving is
// proven independently of what the upload route accepts.
//
// Behaviour assumed:
//  - Serving is id-based: GET /api/companies/<companyId>/uploads/<id> (the url the upload route returns).
//  - Serving headers are MANDATORY for every type; SVG sanitising is optional and not asserted.
//  - Non-members, unknown ids and ids of another company are indistinguishable: 404 { code: "unavailable" }.
//  - DELETE succeeds with 200 or 204; a second DELETE of the same id is 404; deleting an upload that knowledge entries
//    still reference is ALLOWED (references render as unavailable later).
//  - Archived companies refuse DELETE with 422 (the project's archived-write convention) but still serve reads.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURES,
  IDS,
  LEAK,
  MALICIOUS_SVGS,
  arrange,
  gif,
  itemContext,
  itemRequest,
  needItem,
  payload,
  png,
  readBody,
  svg,
  text,
  upload,
  uuidRe,
  world,
} from "../helpers/uploads-world";

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

const SAFE_CSP = ["default-src 'none'", "style-src 'unsafe-inline'", "sandbox"];
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

let a: string;
let b: string;
beforeEach(() => {
  ({ a, b } = arrange());
});

async function get(company: string, id: string, origin?: string | null) {
  const { GET } = await needItem();
  const response = await GET(itemRequest("GET", company, id, { origin }), itemContext(company, id));
  return { response, bytes: Buffer.from(await response.clone().arrayBuffer()), ...(await readBody(response)) };
}
async function del(company: string, id: string, origin?: string | null) {
  const { DELETE } = await needItem();
  const response = await DELETE(itemRequest("DELETE", company, id, { origin }), itemContext(company, id));
  return { response, ...(await readBody(response)) };
}

/** The full response header set that makes a stored image inert in the app origin. */
function expectServingHeaders(response: Response, type: string) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(type);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const csp = (response.headers.get("content-security-policy") ?? "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  expect([...csp].sort(), `CSP was ${response.headers.get("content-security-policy")}`).toEqual([...SAFE_CSP].sort());
  expect(response.headers.get("content-disposition") ?? "").toMatch(/^inline(\s*;|$)/i);
  const cache = response.headers.get("cache-control") ?? "";
  expect(cache).toMatch(/\bprivate\b/);
  expect(cache).not.toMatch(/\bpublic\b|s-maxage/);
  expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
  expect(response.headers.get("location")).toBeNull();
}

/** Whatever happens to a hostile object, it is never delivered as something a browser would execute. */
function expectInertIfServed(response: Response) {
  if (response.status >= 200 && response.status < 300) {
    const type = response.headers.get("content-type") ?? "";
    expect(ALLOWED, `served as ${type}`).toContain(type);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy") ?? "").toContain("default-src 'none'");
    expect(response.headers.get("content-security-policy") ?? "").toContain("sandbox");
  } else {
    expect(response.status).toBeGreaterThanOrEqual(400);
  }
}

describe("serving: members get the object, with fixed headers for every type", () => {
  const cases: [string, Uint8Array, string, string][] = [
    ["png", FIXTURES.png.bytes, "png", "image/png"],
    ["jpg", FIXTURES.jpeg.bytes, "jpg", "image/jpeg"],
    ["gif", FIXTURES.gif.bytes, "gif", "image/gif"],
    ["webp", FIXTURES.webp.bytes, "webp", "image/webp"],
    ["svg", FIXTURES.svg.bytes, "svg", "image/svg+xml"],
  ];
  for (const [label, bytes, ext, type] of cases) {
    it(`${label}: 200, exact Content-Type, nosniff, fixed CSP, inline, private cache, same bytes`, async () => {
      const { id } = world.seedUpload({ companyId: a, ext, bytes });
      const result = await get(a, id);
      expectServingHeaders(result.response, type);
      if (ext === "svg") {
        expect(result.bytes.toString()).toContain("<rect");
      } else {
        expect(result.bytes.equals(Buffer.from(bytes))).toBe(true);
      }
    });
  }

  it("owner, editor and viewer can all read; the three kinds are all served", async () => {
    for (const kind of ["logos", "portraits", "offering-images"]) {
      const { id } = world.seedUpload({ companyId: a, kind, bytes: png() });
      for (const user of [IDS.owner, IDS.editor, IDS.viewer]) {
        world.user = { id: user };
        const result = await get(a, id);
        expect(result.response.status, `${kind} as ${user}`).toBe(200);
      }
    }
  });

  it("reading does not need an Origin header, and an archived company is still readable by its members", async () => {
    const archived = world.seedCompany({ archived: true, members: { [IDS.viewer]: "viewer" } });
    const { id } = world.seedUpload({ companyId: archived, bytes: png() });
    world.user = { id: IDS.viewer };
    const result = await get(archived, id, null);
    expectServingHeaders(result.response, "image/png");
  });

  it("a signed-out caller gets 401 and no object bytes", async () => {
    const { id } = world.seedUpload({ companyId: a, bytes: png() });
    world.user = null;
    const result = await get(a, id);
    expect(result.response.status).toBe(401);
    expect(world.storageCalls.filter((c) => c.op === "download")).toEqual([]);
  });

  it("never exposes the storage backend: no redirect, no signed or public bucket URL in body, headers or logs", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
    }
    const { id } = world.seedUpload({ companyId: a, bytes: png() });
    const ok = await get(a, id);
    world.storageFailures.set("download", { message: "fetch https://proj.supabase.co/storage/v1/object/sign/x?token=SIGNED_SECRET_TOKEN_9f3a7c failed SERVICE_ROLE_SECRET_VALUE_b81d" });
    const failed = await get(a, id);
    for (const result of [ok, failed]) {
      expect([...result.response.headers.entries()].join("\n")).not.toMatch(LEAK);
      expect(result.response.status >= 300 && result.response.status < 400, "no redirect to storage").toBe(false);
    }
    expect(failed.response.status).toBeGreaterThanOrEqual(400);
    expect(failed.text).not.toMatch(LEAK);
    expect(lines.join("\n")).not.toMatch(LEAK);
  });

  it("an upload whose object has vanished from storage is 404, not a 5xx", async () => {
    const { id, path } = world.seedUpload({ companyId: a, bytes: png() });
    world.objects.delete(path);
    const result = await get(a, id);
    expect(result.response.status).toBe(404);
  });
});

describe("hostile content cannot run script in the app origin", () => {
  for (const [label, source] of Object.entries(MALICIOUS_SVGS)) {
    it(`stored SVG with ${label} is served only as image/svg+xml with the sandbox CSP, nosniff and inline`, async () => {
      const { id } = world.seedUpload({ companyId: a, ext: "svg", bytes: text(source) });
      const result = await get(a, id);
      expectServingHeaders(result.response, "image/svg+xml");
    });

    it(`SVG with ${label} through the upload route: rejected, or accepted and then served with the same fixed headers`, async () => {
      const posted = await upload(a, { file: { bytes: text(source), name: "m.svg", mime: "image/svg+xml" }, kind: "logos" });
      if (posted.response.status !== 201) {
        expect(posted.response.status).toBeGreaterThanOrEqual(400);
        expect(posted.response.status).toBeLessThan(500);
        return;
      }
      const body = payload(posted.json);
      const served = await get(a, body.id);
      expectServingHeaders(served.response, "image/svg+xml");
      expect(new URL(body.url, "https://app.example").pathname).toBe(`/api/companies/${a}/uploads/${body.id}`);
    });
  }

  it("a GIF/script polyglot is served as image/gif and nothing else", async () => {
    const bytes = new Uint8Array(Buffer.concat([Buffer.from(gif()), Buffer.from("<script>alert(document.domain)</script>")]));
    const { id } = world.seedUpload({ companyId: a, ext: "gif", bytes });
    const result = await get(a, id);
    expectServingHeaders(result.response, "image/gif");
  });

  it("an SVG object whose stored metadata claims text/html is still never served as html", async () => {
    const { id } = world.seedUpload({ companyId: a, ext: "svg", bytes: text(MALICIOUS_SVGS.script), contentType: "text/html", metaContentType: "text/html" });
    const result = await get(a, id);
    expectInertIfServed(result.response);
    if (result.response.status === 200) {
      expect(result.response.headers.get("content-type")).toBe("image/svg+xml");
    }
  });

  it("an HTML document sitting under a .png name (planted straight into storage) is not served as html", async () => {
    const { id } = world.seedUpload({ companyId: a, ext: "png", bytes: text("<html><script>alert(1)</script></html>"), contentType: "text/html", metaContentType: "text/html" });
    const result = await get(a, id);
    expectInertIfServed(result.response);
    expect(result.response.headers.get("content-type") ?? "").not.toMatch(/html|javascript|xml(?!\+)/i);
  });

  it("stored metadata of an unlisted type (application/octet-stream, text/plain) never leaks through as the served type", async () => {
    for (const stored of ["application/octet-stream", "text/plain;charset=UTF-8", "application/javascript"]) {
      world.reset();
      ({ a, b } = arrange());
      const { id } = world.seedUpload({ companyId: a, ext: "png", bytes: png(), contentType: stored, metaContentType: stored });
      const result = await get(a, id);
      expectInertIfServed(result.response);
      if (result.response.status === 200) {
        expect(result.response.headers.get("content-type")).toBe("image/png");
      }
    }
  });
});

describe("only members of the owning company can read; everyone else gets an identical 404", () => {
  it("a non-member gets 404 { code: unavailable } with no bytes and no storage read, same as for an unknown id", async () => {
    const { id } = world.seedUpload({ companyId: a, bytes: png() });
    world.user = { id: IDS.outsider };
    const existing = await get(a, id);
    const unknown = await get(a, "b0000000-0000-4000-8000-00000000dead");
    expect(existing.response.status).toBe(404);
    expect(unknown.response.status).toBe(404);
    expect(existing.json.error.code).toBe("unavailable");
    expect({ ...existing.json, requestId: 0 }).toEqual({ ...unknown.json, requestId: 0 });
    expect(existing.bytes.includes(Buffer.from(png()))).toBe(false);
    expect(world.storageCalls.filter((c) => c.op === "download")).toEqual([]);
  });

  it("an id that belongs to another company is 404 under this company, even for a user who may read it under its own", async () => {
    const mine = world.seedUpload({ companyId: a, bytes: png() });
    const theirs = world.seedUpload({ companyId: b, bytes: svg('<circle r="3"/>'), ext: "svg" });
    world.user = { id: IDS.rival };
    expect((await get(b, theirs.id)).response.status).toBe(200);
    expect((await get(b, mine.id)).response.status).toBe(404);
    world.user = { id: IDS.owner };
    world.tables.company_members.push({ company_id: b, user_id: IDS.owner, role: "owner", added_by: IDS.owner, created_at: "2026-10-01T00:00:00.000Z" });
    world.storageCalls = [];
    const crossed = await get(a, theirs.id);
    expect(crossed.response.status, "an id of company B must not be readable through company A's url").toBe(404);
    expect(crossed.text).not.toContain("<circle");
    expect(world.storageCalls.filter((c) => c.op === "download" && c.path?.includes(`/${b}/`))).toEqual([]);
    expect((await get(b, theirs.id)).response.status).toBe(200);
  });

  it("the url of company A's upload requested as company B's member yields 404 and no bytes", async () => {
    const mine = world.seedUpload({ companyId: a, bytes: png() });
    world.user = { id: IDS.rival };
    const result = await get(b, mine.id);
    expect(result.response.status).toBe(404);
    expect(result.bytes.includes(Buffer.from(png()))).toBe(false);
  });

  it("malformed or traversing ids and company ids are 4xx and reach storage with nothing", async () => {
    world.seedUpload({ companyId: a, bytes: png() });
    world.seedUpload({ companyId: b, bytes: png() });
    world.storageCalls = [];
    const ids = ["not-a-uuid", "..", "../..", "../" + b, `${b}/../x`, "%2e%2e%2f", "..%2f..%2fetc%2fpasswd", "logos", "logos/x", "\u0000", "", "*", "null", "undefined"];
    for (const id of ids) {
      const result = await get(a, id);
      expect([400, 404, 422], `GET id=${JSON.stringify(id)} -> ${result.response.status}`).toContain(result.response.status);
      const removed = await del(a, id);
      expect([400, 404, 422], `DELETE id=${JSON.stringify(id)} -> ${removed.response.status}`).toContain(removed.response.status);
    }
    for (const company of ["not-a-uuid", "..", "../" + b, `${a}/../${b}`]) {
      const { id } = world.seedUpload({ companyId: a, bytes: png() });
      const result = await get(company, id);
      expect([400, 404, 422], `company=${company}`).toContain(result.response.status);
    }
    const touched = world.storageCalls.filter((c) => ["download", "remove", "info", "exists"].includes(c.op));
    for (const call of touched) {
      for (const p of [call.path, ...(call.paths ?? [])]) {
        expect(p ?? "", JSON.stringify(call)).not.toMatch(/\.\.|\\|%2e|\u0000|\*/i);
      }
    }
    expect(world.objects.size).toBe(2 + 4);
  });
});

describe("delete", () => {
  it("an owner or editor deletes exactly one object: 200/204, gone from storage, then 404 on read", async () => {
    for (const user of [IDS.owner, IDS.editor]) {
      world.reset();
      ({ a, b } = arrange());
      const target = world.seedUpload({ companyId: a, bytes: png() });
      const sibling = world.seedUpload({ companyId: a, bytes: png(), kind: "portraits" });
      const foreign = world.seedUpload({ companyId: b, bytes: png() });
      world.user = { id: user };
      world.storageCalls = [];
      const result = await del(a, target.id);
      expect([200, 204], `${user}: ${result.text.slice(0, 200)}`).toContain(result.response.status);
      expect(world.objects.has(target.path)).toBe(false);
      expect(world.objects.has(sibling.path)).toBe(true);
      expect(world.objects.has(foreign.path)).toBe(true);
      for (const call of world.storageCalls.filter((c) => c.op === "remove")) {
        expect(call.paths).toEqual([target.path]);
      }
      expect((await get(a, target.id)).response.status).toBe(404);
      expect((await get(a, sibling.id)).response.status).toBe(200);
      expect((world.tables.uploads ?? []).some((r) => r.id === target.id)).toBe(false);
    }
  });

  it("a viewer cannot delete: 403 forbidden and the object stays readable", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    world.user = { id: IDS.viewer };
    world.storageCalls = [];
    const result = await del(a, target.id);
    expect(result.response.status).toBe(403);
    expect(result.text).toContain("forbidden");
    expect(world.mutations()).toEqual([]);
    expect(world.objects.has(target.path)).toBe(true);
    expect((await get(a, target.id)).response.status).toBe(200);
  });

  it("a non-member and a signed-out caller cannot delete: 404 and 401", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    world.user = { id: IDS.outsider };
    expect((await del(a, target.id)).response.status).toBe(404);
    world.user = null;
    expect((await del(a, target.id)).response.status).toBe(401);
    expect(world.mutations()).toEqual([]);
    expect(world.objects.has(target.path)).toBe(true);
  });

  it("a cross-company id is 404 and nothing is deleted, in either direction", async () => {
    const mine = world.seedUpload({ companyId: a, bytes: png() });
    const theirs = world.seedUpload({ companyId: b, bytes: png() });
    world.tables.company_members.push({ company_id: b, user_id: IDS.owner, role: "owner", added_by: IDS.owner, created_at: "2026-10-01T00:00:00.000Z" });
    world.storageCalls = [];
    expect((await del(a, theirs.id)).response.status).toBe(404);
    world.user = { id: IDS.rival };
    expect((await del(b, mine.id)).response.status).toBe(404);
    expect(world.mutations()).toEqual([]);
    expect(world.objects.has(mine.path)).toBe(true);
    expect(world.objects.has(theirs.path)).toBe(true);
  });

  it("DELETE needs the app origin: foreign, absent and look-alike origins are 403 invalid_origin and delete nothing", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    for (const origin of ["https://evil.example", null, "https://app.example.evil.example", "http://app.example"]) {
      const result = await del(a, target.id, origin);
      expect(result.response.status, `origin=${origin}`).toBe(403);
      expect(result.text).toContain("invalid_origin");
    }
    expect(world.mutations()).toEqual([]);
    expect(world.objects.has(target.path)).toBe(true);
  });

  it("an archived company refuses DELETE with 422 and keeps the object", async () => {
    const archived = world.seedCompany({ archived: true, members: { [IDS.owner]: "owner", [IDS.editor]: "editor" } });
    const target = world.seedUpload({ companyId: archived, bytes: png() });
    for (const user of [IDS.owner, IDS.editor]) {
      world.user = { id: user };
      const result = await del(archived, target.id);
      expect(result.response.status, result.text.slice(0, 200)).toBe(422);
    }
    expect(world.mutations()).toEqual([]);
    expect(world.objects.has(target.path)).toBe(true);
    expect((await get(archived, target.id)).response.status).toBe(200);
  });

  it("a second DELETE of the same id is 404 (nothing left), never a 5xx, and an unknown id is 404", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    const first = await del(a, target.id);
    expect([200, 204]).toContain(first.response.status);
    const second = await del(a, target.id);
    expect(second.response.status).toBe(404);
    expect(second.json.error.code).toBe("unavailable");
    expect((await del(a, "c0000000-0000-4000-8000-00000000beef")).response.status).toBe(404);
  });

  it("deleting an upload that knowledge entries still reference is allowed (references render as unavailable later)", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    world.tables.knowledge_entries.push({ id: "e0000000-0000-4000-8000-000000000001", company_id: a, kind: "branding_and_style", current_revision: 1 });
    world.tables.knowledge_entry_versions.push({ id: "e1000000-0000-4000-8000-000000000001", company_id: a, entry_id: "e0000000-0000-4000-8000-000000000001", revision: 1, content: { logos: [{ upload_id: target.id, url: `/api/companies/${a}/uploads/${target.id}` }] } });
    const result = await del(a, target.id);
    expect([200, 204], result.text.slice(0, 200)).toContain(result.response.status);
    expect(world.objects.has(target.path)).toBe(false);
    expect((await get(a, target.id)).response.status).toBe(404);
    expect(world.tables.knowledge_entry_versions).toHaveLength(1);
  });

  it("a storage failure on delete is a sanitised error and leaves the upload consistent (still readable)", async () => {
    const target = world.seedUpload({ companyId: a, bytes: png() });
    world.storageFailures.set("remove", { message: "boom https://proj.supabase.co/storage/v1/object token=SIGNED_SECRET_TOKEN_9f3a7c" });
    const result = await del(a, target.id);
    expect(result.response.status).toBeGreaterThanOrEqual(400);
    expect(result.text).not.toMatch(LEAK);
    world.storageFailures.clear();
    expect(world.objects.has(target.path)).toBe(true);
    expect((await get(a, target.id)).response.status, "no half-delete: metadata must not be gone while the object remains").toBe(200);
  });

  it("a delete followed by a fresh upload works and yields a new id", async () => {
    const posted = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    const first = payload(posted.json);
    expect(first.id).toMatch(uuidRe);
    expect([200, 204]).toContain((await del(a, first.id)).response.status);
    const again = payload((await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" })).json);
    expect(again.id).not.toBe(first.id);
    expect((await get(a, again.id)).response.status).toBe(200);
  });
});

describe("round trip: what the upload route returns is exactly what the serving route reads", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`round trip ${name}: POST then GET the returned url`, async () => {
      const posted = await upload(a, { file: { bytes: fixture.bytes, name: fixture.name, mime: fixture.mime }, kind: "portraits" });
      expect(posted.response.status, posted.text.slice(0, 300)).toBe(201);
      const body = payload(posted.json);
      const url = new URL(body.url, "https://app.example");
      expect(url.pathname).toBe(`/api/companies/${a}/uploads/${body.id}`);
      const served = await get(a, body.id);
      expectServingHeaders(served.response, fixture.type);
      expect(served.bytes.length).toBe(body.size_bytes);
      if (name !== "svg") {
        expect(served.bytes.equals(Buffer.from(fixture.bytes))).toBe(true);
      }
      world.user = { id: IDS.outsider };
      expect((await get(a, body.id)).response.status).toBe(404);
    });
  }
});
