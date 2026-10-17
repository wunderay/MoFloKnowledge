// Acceptance tests for Quest Q6 "storage-uploads": criteria C1 (upload API), C2 (validation), C6 (write authorization
// on POST) and C8 (no upload-count cap). Locked before any builder starts; they drive the route handler through its
// HTTP interface with the Supabase client replaced by the in-memory world in tests/helpers/uploads-world.ts.
//
// DECISIONs recorded in the Petitioner hand-back (short form):
//  - Routes: POST src/app/api/companies/[companyId]/uploads/route.ts. Success bodies may be the API envelope
//    { data, error, requestId } (project convention) or the bare object; tests read either.
//  - A file whose real bytes disagree with its filename/MIME is either stored under its REAL type/extension or
//    rejected; storing it as the claimed type is never acceptable.
//  - The stored filename never comes from the client: the path is exactly <kind>/<companyId>/<uuid>.<ext>.
//  - Authorization runs before body validation (a viewer or non-member learns nothing about file rules).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUCKET,
  FIXTURES,
  IDS,
  LEAK,
  MALICIOUS_SVGS,
  MiB,
  arrange,
  formFor,
  gif,
  jpeg,
  needCollection,
  collectionContext,
  payload,
  png,
  postRequest,
  readBody,
  svg,
  text,
  upload,
  uuidRe,
  webp,
  world,
} from "../helpers/uploads-world";

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

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const USER_MESSAGE_TYPES = "Use PNG, JPG, GIF, WebP, or SVG";

let a: string;
let b: string;
beforeEach(() => {
  ({ a, b } = arrange());
});

/** A rejected upload: a 4xx JSON error with a readable message, nothing stored, nothing recorded. */
function expectRejected(result: { response: Response; json: any; text: string }, message?: string) {
  expect(result.response.status, result.text.slice(0, 300)).toBeGreaterThanOrEqual(400);
  expect(result.response.status, result.text.slice(0, 300)).toBeLessThan(500);
  expect([401, 403, 404]).not.toContain(result.response.status);
  expect(result.response.headers.get("content-type") ?? "").toContain("application/json");
  expect(result.json, "the error body must be JSON").toBeDefined();
  if (message) expect(result.text).toContain(message);
  expect(result.text.length).toBeGreaterThan(10);
  expect(world.mutations(), "a rejected upload must not touch storage").toEqual([]);
  expect(world.objects.size).toBe(0);
  expect((world.tables.uploads ?? []).length).toBe(0);
}

describe("C1 upload API: stores in the private bucket and answers with an app-served url", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`C1 ${name}: 201 with { id, path, content_type, size_bytes, url } and one non-overwriting upload`, async () => {
      const result = await upload(a, { file: { bytes: fixture.bytes, name: fixture.name, mime: fixture.mime }, kind: "logos" });
      expect(result.response.status, result.text.slice(0, 300)).toBe(201);
      const body = payload(result.json);
      expect(Object.keys(body)).toEqual(expect.arrayContaining(["id", "path", "content_type", "size_bytes", "url"]));
      expect(body.id).toMatch(uuidRe);
      expect(body.content_type).toBe(fixture.type);
      expect(body.size_bytes).toBe(world.objects.get(body.path)?.bytes.byteLength);
      const pathPattern = new RegExp(`^logos/${a}/([0-9a-f-]{36})\\.(png|jpe?g|gif|webp|svg)$`);
      expect(body.path).toMatch(pathPattern);
      expect(body.path.match(pathPattern)![1]).toMatch(uuidRe);
      expect(body.path.split(".").pop()).toMatch(fixture.ext);

      const uploads = world.storageCalls.filter((c) => c.op === "upload");
      expect(uploads).toHaveLength(1);
      expect(uploads[0]!.bucket).toBe(BUCKET);
      expect(uploads[0]!.path).toBe(body.path);
      expect(uploads[0]!.options?.upsert ?? false, "uploads must never overwrite an existing object").toBe(false);
      const stored = world.objects.get(body.path)!;
      expect(stored.contentType, "the object is stored with its real content type, not the storage default").toBe(fixture.type);
      if (name !== "svg") expect(Buffer.from(stored.bytes).equals(Buffer.from(fixture.bytes))).toBe(true);
      else expect(Buffer.from(stored.bytes).toString()).toContain("<rect");
      expect(body.size_bytes).toBe(stored.bytes.byteLength);
      expect(world.storageCalls.every((c) => c.bucket === BUCKET)).toBe(true);
    });
  }

  it("C1 every kind lands under its own prefix: logos, portraits and offering-images", async () => {
    for (const kind of ["logos", "portraits", "offering-images"]) {
      const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind });
      expect(result.response.status, result.text.slice(0, 300)).toBe(201);
      expect(payload(result.json).path).toMatch(new RegExp(`^${kind}/${a}/[0-9a-f-]{36}\\.png$`));
    }
  });

  it("C1 the url is app-served for this company: no bucket URL, no signed token, no redirect", async () => {
    const result = await upload(a, { file: { bytes: png(), name: "logo.png", mime: "image/png" }, kind: "logos" });
    expect(result.response.status).toBe(201);
    const body = payload(result.json);
    const url = new URL(body.url, "https://app.example");
    expect(url.origin).toBe("https://app.example");
    expect(url.pathname).toBe(`/api/companies/${a}/uploads/${body.id}`);
    expect(url.search).toBe("");
    expect(result.text).not.toMatch(LEAK);
    expect([...result.response.headers.entries()].join("\n")).not.toMatch(LEAK);
    expect(result.response.headers.get("location")).toBeNull();
  });

  it("C1 two uploads of identical bytes get distinct ids and distinct objects (uuid names, no overwrite)", async () => {
    const first = payload((await upload(a, { file: { bytes: png(), name: "same.png", mime: "image/png" }, kind: "logos" })).json);
    const second = payload((await upload(a, { file: { bytes: png(), name: "same.png", mime: "image/png" }, kind: "logos" })).json);
    expect(first.id).toMatch(uuidRe);
    expect(second.id).toMatch(uuidRe);
    expect(first.id).not.toBe(second.id);
    expect(first.path).not.toBe(second.path);
    expect(world.objects.size).toBe(2);
  });

  it("C1 an editor can upload too, and the response is private and uncacheable", async () => {
    world.user = { id: IDS.editor };
    const result = await upload(a, { file: { bytes: png(), name: "e.png", mime: "image/png" }, kind: "portraits" });
    expect(result.response.status).toBe(201);
    expect(result.response.headers.get("cache-control") ?? "").toMatch(/no-store|private/);
    expect(result.response.headers.get("cache-control") ?? "").not.toMatch(/public/);
  });

  it("C1 no storage secret or signed URL is written to the logs during uploads", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
    await upload(a, { file: { bytes: png(), name: "ok.png", mime: "image/png" }, kind: "logos" });
    await upload(a, { file: { bytes: text("nope"), name: "bad.png", mime: "image/png" }, kind: "logos" });
    world.storageFailures.set("upload", { message: `Request to ${"https://proj.supabase.co/storage/v1/object/sign/x?token=SIGNED_SECRET_TOKEN_9f3a7c"} failed (SERVICE_ROLE_SECRET_VALUE_b81d)` });
    const failed = await upload(a, { file: { bytes: png(), name: "ok.png", mime: "image/png" }, kind: "logos" });
    expect(failed.response.status).toBeGreaterThanOrEqual(400);
    expect(lines.join("\n")).not.toMatch(LEAK);
  });
});

describe("C2 validation: content sniffing, limits and clear messages", () => {
  it("C2 anything that is not PNG, JPG, GIF, WebP or SVG is rejected with the types message, whatever its name or MIME says", async () => {
    const impostors: Array<[string, Uint8Array, string, string]> = [
      ["plain text named png", text("hello, this is not an image"), "logo.png", "image/png"],
      ["HTML named svg", text("<html><body><script>alert(1)</script></body></html>"), "logo.svg", "image/svg+xml"],
      ["PDF named jpg", text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"), "scan.jpg", "image/jpeg"],
      ["BMP named png", new Uint8Array([0x42, 0x4d, 0x3a, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0]), "x.png", "image/png"],
      ["Windows executable named gif", new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]), "x.gif", "image/gif"],
      ["ZIP named webp", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 8, 0]), "x.webp", "image/webp"],
      ["truncated PNG signature", new Uint8Array([0x89, 0x50, 0x4e]), "x.png", "image/png"],
      ["XML that is not SVG", text('<?xml version="1.0"?><note><to>a</to></note>'), "x.svg", "image/svg+xml"],
      ["JSON named png", text('{"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\"/>"}'), "x.png", "image/png"],
    ];
    for (const [label, bytes, name, mime] of impostors) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes, name, mime }, kind: "logos" });
      expect(result.response.status, `${label}: ${result.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expectRejected(result, USER_MESSAGE_TYPES);
    }
  });

  it("C2 an empty (0-byte) file is rejected, even with a perfect PNG name and MIME", async () => {
    const result = await upload(a, { file: { bytes: new Uint8Array(0), name: "logo.png", mime: "image/png" }, kind: "logos" });
    expectRejected(result);
  });

  it("C2 a PNG renamed .jpg with an image/jpeg MIME is stored as its real type or rejected, never as a JPEG", async () => {
    const result = await upload(a, { file: { bytes: png(), name: "renamed.jpg", mime: "image/jpeg" }, kind: "logos" });
    if (result.response.status === 201) {
      const body = payload(result.json);
      expect(body.content_type).toBe("image/png");
      expect(body.path).toMatch(/\.png$/);
      expect(world.objects.get(body.path)?.contentType).toBe("image/png");
    } else {
      expectRejected(result);
    }
  });

  it("C2 a JPEG named .png and an SVG named .gif are likewise stored by their real type or rejected", async () => {
    for (const [bytes, name, mime, type, ext] of [
      [jpeg(), "photo.png", "image/png", "image/jpeg", /\.jpe?g$/],
      [svg(), "vector.gif", "image/gif", "image/svg+xml", /\.svg$/],
      [webp(), "tile.jpeg", "image/jpeg", "image/webp", /\.webp$/],
    ] as const) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes, name, mime }, kind: "portraits" });
      if (result.response.status === 201) {
        const body = payload(result.json);
        expect(body.content_type).toBe(type);
        expect(body.path).toMatch(ext);
        expect(world.objects.get(body.path)?.contentType).toBe(type);
      } else {
        expectRejected(result);
      }
    }
  });

  it("C2 an upper-case extension and a mixed-case MIME are fine, and the stored extension is lower-case", async () => {
    const result = await upload(a, { file: { bytes: png(), name: "LOGO.PNG", mime: "IMAGE/PNG" }, kind: "logos" });
    expect(result.response.status, result.text.slice(0, 300)).toBe(201);
    const body = payload(result.json);
    expect(body.path).toMatch(new RegExp(`^logos/${a}/[0-9a-f-]{36}\\.png$`));
    expect(body.content_type).toBe("image/png");
  });

  it("C2 SVG exported by common tools is accepted: XML prolog, leading whitespace", async () => {
    for (const source of [
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><circle r="2"/></svg>',
      '\n  <svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><circle r="2"/></svg>\n',
    ]) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes: text(source), name: "mark.svg", mime: "image/svg+xml" }, kind: "logos" });
      expect(result.response.status, result.text.slice(0, 300)).toBe(201);
      expect(payload(result.json).content_type).toBe("image/svg+xml");
    }
  });

  it("C2 logos: exactly 10 MiB is accepted, one byte more is refused with 'Max 10MB'", async () => {
    const atLimit = await upload(a, { file: { bytes: png(10 * MiB), name: "big.png", mime: "image/png" }, kind: "logos" });
    expect(atLimit.response.status, atLimit.text.slice(0, 300)).toBe(201);
    expect(payload(atLimit.json).size_bytes).toBe(10 * MiB);
    expect(world.objects.get(payload(atLimit.json).path)?.bytes.byteLength).toBe(10 * MiB);

    world.reset();
    ({ a, b } = arrange());
    const over = await upload(a, { file: { bytes: png(10 * MiB + 1), name: "big.png", mime: "image/png" }, kind: "logos" });
    expectRejected(over, "Max 10MB");
  });

  for (const kind of ["portraits", "offering-images"]) {
    it(`C2 ${kind}: exactly 5 MiB is accepted, one byte more is refused with 'Max 5MB'`, async () => {
      const atLimit = await upload(a, { file: { bytes: png(5 * MiB), name: "p.png", mime: "image/png" }, kind });
      expect(atLimit.response.status, atLimit.text.slice(0, 300)).toBe(201);
      expect(payload(atLimit.json).size_bytes).toBe(5 * MiB);

      world.reset();
      ({ a, b } = arrange());
      const over = await upload(a, { file: { bytes: png(5 * MiB + 1), name: "p.png", mime: "image/png" }, kind });
      expectRejected(over, "Max 5MB");
    });
  }

  it("C2 the limit depends on the kind: 5 MiB + 1 is fine for a logo and 10 MiB is too big for a portrait", async () => {
    const logo = await upload(a, { file: { bytes: png(5 * MiB + 1), name: "l.png", mime: "image/png" }, kind: "logos" });
    expect(logo.response.status, logo.text.slice(0, 300)).toBe(201);
    world.reset();
    ({ a, b } = arrange());
    const portrait = await upload(a, { file: { bytes: png(10 * MiB), name: "p.png", mime: "image/png" }, kind: "portraits" });
    expectRejected(portrait, "Max 5MB");
  });

  it("C2 an unknown, missing, empty or traversing kind is rejected with a message and stores nothing", async () => {
    const kinds: Array<string | null> = [null, "", "avatars", "logo", "offering_images", "../logos", "logos/../portraits", "logos/", "/logos", "logos\\..\\x", "logos%2F..%2Fx", "logos\u0000", " logos", `../${b}/logos`];
    for (const kind of kinds) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind });
      expect(result.response.status, `kind=${JSON.stringify(kind)} ${result.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expectRejected(result);
    }
  });

  it("C2 a missing file field, a text value instead of a file, and a non-multipart body are all 4xx JSON errors", async () => {
    const { POST } = await needCollection();
    const cases: Array<[string, BodyInit, Record<string, string>]> = [
      ["no file", formFor({ kind: "logos" }), {}],
      ["text instead of file", formFor({ file: "not a file", kind: "logos" }), {}],
      ["json body", JSON.stringify({ kind: "logos" }), { "content-type": "application/json" }],
      ["plain text body", "hello", { "content-type": "text/plain" }],
    ];
    for (const [label, body, headers] of cases) {
      world.reset();
      ({ a, b } = arrange());
      const response = await POST(postRequest(a, body, { headers }), collectionContext(a));
      const parsed = await readBody(response);
      expect(response.status, label).toBeGreaterThanOrEqual(400);
      expect(response.status, label).toBeLessThan(500);
      expect(parsed.json, label).toBeDefined();
      expect(world.mutations(), label).toEqual([]);
    }
  });

  it("C2 the client filename never reaches storage: ../ traversal, separators, NUL and unicode names yield a uuid path or a rejection", async () => {
    const names = ["../../etc/passwd.png", "..\\..\\windows\\win.ini.png", "a/b/c.png", "logo\u0000.png", "логотип-日本-🚀.png", "%2e%2e%2f.png", "..png", ".png", "x".repeat(300) + ".png", "con.png"];
    for (const name of names) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes: png(), name, mime: "image/png" }, kind: "logos" });
      if (result.response.status === 201) {
        const body = payload(result.json);
        expect(body.path, name).toMatch(new RegExp(`^logos/${a}/[0-9a-f-]{36}\\.png$`));
        expect(world.storageCalls.filter((c) => c.op === "upload").map((c) => c.path)).toEqual([body.path]);
      } else {
        expectRejected(result);
      }
    }
  });

  it("C2 a polyglot (GIF header followed by script) is stored only as a GIF or refused, and never as HTML", async () => {
    const bytes = Buffer.concat([Buffer.from(gif()), Buffer.from("<script>alert(document.domain)</script><html onload=alert(1)>")]);
    const result = await upload(a, { file: { bytes: new Uint8Array(bytes), name: "evil.gif", mime: "image/gif" }, kind: "logos" });
    if (result.response.status === 201) {
      const body = payload(result.json);
      expect(body.content_type).toBe("image/gif");
      expect(world.objects.get(body.path)?.contentType).toBe("image/gif");
      expect(body.path).toMatch(/\.gif$/);
    } else {
      expectRejected(result);
    }
  });

  it("C2 an HTML-looking file that merely starts with an SVG-ish comment is not stored as html", async () => {
    const bytes = text('<!-- hi --><html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>');
    const result = await upload(a, { file: { bytes, name: "x.svg", mime: "image/svg+xml" }, kind: "logos" });
    if (result.response.status === 201) {
      const stored = world.objects.get(payload(result.json).path)!;
      expect(stored.contentType).toBe("image/svg+xml");
    } else {
      expectRejected(result, USER_MESSAGE_TYPES);
    }
  });

  it("C2 SVG files carrying active content are accepted-with-safe-serving or refused, and any acceptance is typed image/svg+xml", async () => {
    for (const [label, source] of Object.entries(MALICIOUS_SVGS)) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes: text(source), name: "m.svg", mime: "image/svg+xml" }, kind: "logos" });
      if (result.response.status === 201) {
        const body = payload(result.json);
        expect(body.content_type, label).toBe("image/svg+xml");
        expect(body.path, label).toMatch(/\.svg$/);
        const stored = world.objects.get(body.path)!;
        expect(stored.contentType, label).toBe("image/svg+xml");
        expect(ALLOWED_TYPES).toContain(stored.contentType);
      } else {
        expectRejected(result);
      }
    }
  });
});

describe("C6 authorization on POST: origin, session, role, archived company, tenant", () => {
  it("C6 a request from another origin, or without Origin, is 403 invalid_origin and stores nothing", async () => {
    for (const origin of ["https://evil.example", null, "https://app.example.evil.example", "http://app.example"]) {
      world.reset();
      ({ a, b } = arrange());
      const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" }, { origin });
      expect(result.response.status, `origin=${origin}`).toBe(403);
      expect(result.text).toContain("invalid_origin");
      expect(world.mutations()).toEqual([]);
    }
  });

  it("C6 a signed-out caller gets 401 and nothing is stored", async () => {
    world.user = null;
    const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(result.response.status).toBe(401);
    expect(world.mutations()).toEqual([]);
  });

  it("C6 a viewer cannot upload: 403 forbidden, nothing stored", async () => {
    world.user = { id: IDS.viewer };
    const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(result.response.status, result.text.slice(0, 200)).toBe(403);
    expect(result.text).toContain("forbidden");
    expect(world.mutations()).toEqual([]);
    expect(world.objects.size).toBe(0);
    expect((world.tables.uploads ?? []).length).toBe(0);
  });

  it("C6 a non-member gets 404 (not 403) and nothing is stored", async () => {
    world.user = { id: IDS.outsider };
    const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(result.response.status, result.text.slice(0, 200)).toBe(404);
    expect(world.mutations()).toEqual([]);
  });

  it("C6 owner of another company cannot upload into this one: 404", async () => {
    world.user = { id: IDS.rival };
    const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(result.response.status).toBe(404);
    expect(world.mutations()).toEqual([]);
    const own = await upload(b, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(own.response.status, own.text.slice(0, 200)).toBe(201);
    expect(payload(own.json).path.startsWith(`logos/${b}/`)).toBe(true);
  });

  it("C6 authorization comes before validation: a viewer sending junk learns 403, a stranger sending junk learns 404", async () => {
    world.user = { id: IDS.viewer };
    const viewer = await upload(a, { file: { bytes: new Uint8Array(0), name: "x.png", mime: "image/png" }, kind: "nonsense" });
    expect(viewer.response.status).toBe(403);
    world.user = { id: IDS.outsider };
    const stranger = await upload(a, { file: { bytes: png(10 * MiB + 1), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(stranger.response.status).toBe(404);
    expect(world.mutations()).toEqual([]);
  });

  it("C6 an archived company refuses uploads (422 validation, like every other archived write) and stores nothing", async () => {
    const archived = world.seedCompany({ archived: true, members: { [IDS.owner]: "owner", [IDS.editor]: "editor" } });
    for (const user of [IDS.owner, IDS.editor]) {
      world.user = { id: user };
      const result = await upload(archived, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
      expect(result.response.status, result.text.slice(0, 200)).toBe(422);
      expect(result.response.headers.get("content-type") ?? "").toContain("application/json");
    }
    expect(world.mutations()).toEqual([]);
    expect(world.objects.size).toBe(0);
  });

  it("C6 a malformed company id is a 4xx and touches nothing", async () => {
    const { POST } = await needCollection();
    for (const id of ["not-a-uuid", "..", "../x", "%2e%2e", `${a}/../${b}`, ""]) {
      const response = await POST(postRequest(id, formFor({ file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" })), collectionContext(id));
      expect(response.status, id).toBeGreaterThanOrEqual(400);
      expect(response.status, id).toBeLessThan(500);
    }
    expect(world.mutations()).toEqual([]);
  });
});

describe("C6 upload failures leave no half-written state and leak nothing", () => {
  it("C6 a storage failure is a sanitised JSON error and no metadata row survives", async () => {
    world.storageFailures.set("upload", { message: "connect ECONNREFUSED https://proj.supabase.co/storage/v1 key=SERVICE_ROLE_SECRET_VALUE_b81d" });
    const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    expect(result.response.status).toBeGreaterThanOrEqual(400);
    expect(result.json).toBeDefined();
    expect(result.text).not.toMatch(LEAK);
    expect(result.text).not.toContain("ECONNREFUSED");
    expect(world.objects.size).toBe(0);
    expect((world.tables.uploads ?? []).length).toBe(0);
  });

  it("C6 either both the object and its metadata are stored or neither is (metadata insert failure leaves no orphan object)", async () => {
    world.tableFailures.set("uploads:insert", { message: "relation uploads exploded password=hunter2" });
    const result = await upload(a, { file: { bytes: png(), name: "x.png", mime: "image/png" }, kind: "logos" });
    const triedMetadata = world.tableCalls.some((c) => c.table === "uploads" && c.op === "insert");
    if (triedMetadata) {
      expect(result.response.status).toBeGreaterThanOrEqual(400);
      expect(result.text).not.toContain("hunter2");
      expect(world.objects.size, "the already-uploaded object must be removed again").toBe(0);
    } else {
      // The design keeps no metadata table: the upload simply succeeds.
      expect(result.response.status).toBe(201);
    }
    expect((world.tables.uploads ?? []).length).toBe(0);
  });
});

describe("C8 the upload API does not enforce the per-offering image cap", () => {
  it("C8 25 consecutive uploads to one company and kind all succeed (the 20-image cap belongs to attach time)", async () => {
    const paths = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const result = await upload(a, { file: { bytes: png(), name: `img-${i}.png`, mime: "image/png" }, kind: "offering-images" });
      expect(result.response.status, `upload ${i}: ${result.text.slice(0, 200)}`).toBe(201);
      paths.add(payload(result.json).path);
    }
    expect(paths.size).toBe(25);
    expect(world.objects.size).toBe(25);
  });
});
