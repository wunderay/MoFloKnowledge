import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type Secrets = Record<string, string>;
interface SecretsModule {
  generateSecrets(options?: { nowSeconds?: number }): Secrets;
  signAnonKey(secret: string, nowSeconds?: number): string;
  loadOrCreateSecrets(file: string, options?: { nowSeconds?: number }): { secrets: Secrets; created: boolean };
  parseEnv(text: string): Secrets;
  serializeEnv(values: Secrets): string;
}
interface LocalModule {
  parseArgs(argv: string[]): { mode: string; open: boolean };
  composeArgs(mode: string): string[];
  findLogin(logText: string): string | null;
}
// Plain .mjs scripts have no type declarations, so they are loaded by URL.
const load = async <T>(path: string) => (await import(pathToFileURL(join(process.cwd(), path)).href)) as T;

describe("local stack secrets (deploy/local/secrets.mjs)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moflo-secrets-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("generates distinct strong secrets", async () => {
    const { generateSecrets } = await load<SecretsModule>("deploy/local/secrets.mjs");
    const a = generateSecrets();
    const b = generateSecrets();
    expect(a.JWT_SECRET).toHaveLength(64);
    for (const key of ["PG_SUPER_PASSWORD", "AUTH_ADMIN_PASSWORD", "AUTHENTICATOR_PASSWORD", "WORKER_PASSWORD", "DEMO_PASSWORD"]) {
      expect(a[key]).toMatch(/^[A-Za-z0-9_-]{24,}$/);
      expect(a[key]).not.toBe(b[key]);
    }
    expect(new Set([a.PG_SUPER_PASSWORD, a.AUTH_ADMIN_PASSWORD, a.AUTHENTICATOR_PASSWORD, a.WORKER_PASSWORD]).size).toBe(4);
    expect(a.DEMO_EMAIL).toBe("demo@local.test");
  });

  it("signs the publishable key as an HS256 JWT with role anon", async () => {
    const { generateSecrets, signAnonKey } = await load<SecretsModule>("deploy/local/secrets.mjs");
    const { JWT_SECRET, ANON_KEY } = generateSecrets({ nowSeconds: 1_700_000_000 });
    const [header, payload, signature] = ANON_KEY.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({ role: "anon", iat: 1_700_000_000 });
    expect(signature).toBe(createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url"));
    expect(signAnonKey(JWT_SECRET, 1_700_000_000)).toBe(ANON_KEY);
  });

  it("creates the file once (owner-only) and reuses it afterwards", async () => {
    const { loadOrCreateSecrets, parseEnv } = await load<SecretsModule>("deploy/local/secrets.mjs");
    const file = join(dir, "nested", "secrets.env");
    const first = loadOrCreateSecrets(file);
    expect(first.created).toBe(true);
    expect(statSync(file).mode & 0o077).toBe(0);
    const text = readFileSync(file, "utf8");
    expect(parseEnv(text)).toEqual(first.secrets);
    const second = loadOrCreateSecrets(file);
    expect(second.created).toBe(false);
    expect(second.secrets).toEqual(first.secrets);
    expect(readFileSync(file, "utf8")).toBe(text);
  });

  it("keeps stored values and fills in a missing anon key from the stored JWT secret", async () => {
    const { loadOrCreateSecrets, signAnonKey } = await load<SecretsModule>("deploy/local/secrets.mjs");
    const file = join(dir, "secrets.env");
    writeFileSync(file, "JWT_SECRET=stored-secret\nDEMO_PASSWORD=stored-demo\n");
    const { secrets, created } = loadOrCreateSecrets(file, { nowSeconds: 1_700_000_000 });
    expect(created).toBe(true);
    expect(secrets.JWT_SECRET).toBe("stored-secret");
    expect(secrets.DEMO_PASSWORD).toBe("stored-demo");
    expect(secrets.ANON_KEY).toBe(signAnonKey("stored-secret", 1_700_000_000));
  });
});

describe("one-command wrapper (scripts/local.mjs)", () => {
  it("maps flags to docker compose commands", async () => {
    const { parseArgs, composeArgs } = await load<LocalModule>("scripts/local.mjs");
    expect(parseArgs([])).toEqual({ mode: "start", open: true });
    expect(parseArgs(["--stop"]).mode).toBe("stop");
    expect(parseArgs(["--reset", "--no-open"])).toEqual({ mode: "reset", open: false });
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
    expect(composeArgs("stop")).toEqual(["compose", "down"]);
    expect(composeArgs("reset")).toEqual(["compose", "down", "--volumes"]);
    expect(composeArgs("start")).toEqual(expect.arrayContaining(["up", "--build", "--wait"]));
  });

  it("finds the last printed login in the container log", async () => {
    const { findLogin } = await load<LocalModule>("scripts/local.mjs");
    const log = ["[local] ready", "[local] Open http://localhost:8080 - log in as demo@local.test / old", "[local] Open http://localhost:8080 - log in as demo@local.test / pw123"].join("\n");
    expect(findLogin(log)).toBe("Open http://localhost:8080 - log in as demo@local.test / pw123");
    expect(findLogin("nothing here")).toBeNull();
  });
});
