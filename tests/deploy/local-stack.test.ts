import { createHmac } from "node:crypto";
import net from "node:net";
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
  waitForDocker(options: { probe: () => boolean; sleep: (ms: number) => Promise<void>; timeoutMs?: number; intervalMs?: number }): Promise<boolean>;
  pickPort(options: { isFree: (port: number) => boolean | Promise<boolean>; preferred?: number; range?: [number, number] }): Promise<number>;
  parsePort(text: unknown): number | null;
  publishedPort(output: string): number | null;
  isPortFree(port: number): Promise<boolean>;
  choosePort(options: {
    explicit?: string;
    own?: number | null;
    remembered?: number | null;
    isPortFree: (port: number) => boolean | Promise<boolean>;
  }): Promise<{ port: number; explicit: boolean; notice: string | null }>;
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

  it("waits for the Docker daemon until it answers or the time is up", async () => {
    const { waitForDocker } = await load<LocalModule>("scripts/local.mjs");
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    expect(await waitForDocker({ probe: () => true, sleep })).toBe(true);
    expect(waits).toEqual([]);
    const answers = [false, false, true];
    expect(await waitForDocker({ probe: () => answers.shift() ?? true, sleep, intervalMs: 3000 })).toBe(true);
    expect(waits).toEqual([3000, 3000]);
    waits.length = 0;
    expect(await waitForDocker({ probe: () => false, sleep, timeoutMs: 9000, intervalMs: 3000 })).toBe(false);
    expect(waits).toEqual([3000, 3000, 3000]);
  });

  it("picks the preferred port when it is free", async () => {
    const { pickPort } = await load<LocalModule>("scripts/local.mjs");
    expect(await pickPort({ isFree: () => true })).toBe(8080);
    expect(await pickPort({ isFree: () => true, preferred: 9000 })).toBe(9000);
  });

  it("falls back to the first free port in the range when the preferred one is busy", async () => {
    const { pickPort } = await load<LocalModule>("scripts/local.mjs");
    const busy = new Set([8080, 8081, 8082]);
    expect(await pickPort({ isFree: (port) => !busy.has(port) })).toBe(8083);
    expect(await pickPort({ isFree: async (port) => port === 8099, range: [8081, 8099] })).toBe(8099);
  });

  it("fails clearly when the preferred port and the whole range are busy", async () => {
    const { pickPort } = await load<LocalModule>("scripts/local.mjs");
    await expect(pickPort({ isFree: () => false })).rejects.toThrow(/8080 and 8081-8099 are all in use.*MOFLO_PORT/);
  });

  it("reads ports from text and from `docker compose port` output", async () => {
    const { parsePort, publishedPort } = await load<LocalModule>("scripts/local.mjs");
    expect(parsePort("8080\n")).toBe(8080);
    for (const bad of ["", "abc", "0", "65536", "80 80", "-1", undefined]) {
      expect(parsePort(bad)).toBeNull();
    }
    expect(publishedPort("127.0.0.1:9090\n")).toBe(9090);
    expect(publishedPort("0.0.0.0:8081\n[::]:8081\n")).toBe(8081);
    expect(publishedPort("")).toBeNull();
    expect(publishedPort("0.0.0.0:0")).toBeNull();
  });

  it("sees a listening socket as a busy port", async () => {
    const { isPortFree } = await load<LocalModule>("scripts/local.mjs");
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    expect(await isPortFree(port)).toBe(false);
    await new Promise((resolve) => server.close(resolve));
    expect(await isPortFree(port)).toBe(true);
  });

  it("chooses the start port: a explicit port is used or refused, otherwise 8080 or the next free one", async () => {
    const { choosePort } = await load<LocalModule>("scripts/local.mjs");
    const free = (busy: number[]) => (port: number) => !busy.includes(port);
    expect(await choosePort({ isPortFree: free([]) })).toEqual({ port: 8080, explicit: false, notice: null });
    expect(await choosePort({ isPortFree: free([8080]) })).toEqual({
      port: 8081,
      explicit: false,
      notice: "Port 8080 is in use; using 8081 instead.",
    });
    // a port someone asked for is never swapped for another one
    expect(await choosePort({ explicit: "9090", isPortFree: free([8080]) })).toEqual({ port: 9090, explicit: true, notice: null });
    await expect(choosePort({ explicit: "8080", isPortFree: free([8080]) })).rejects.toThrow(/Port 8080 \(MOFLO_PORT\) is in use/);
    await expect(choosePort({ explicit: "nope", isPortFree: free([]) })).rejects.toThrow(/MOFLO_PORT must be a port number/);
    // this app's own running container is not "in use", and its port keeps the address stable
    expect(await choosePort({ explicit: "8080", own: 8080, isPortFree: free([8080]) })).toMatchObject({ port: 8080 });
    expect(await choosePort({ own: 8085, isPortFree: free([8080, 8085]) })).toEqual({ port: 8085, explicit: false, notice: null });
    // the port kept from an earlier run is reused while it is free, and dropped for the normal search when it is not
    expect(await choosePort({ remembered: 8085, isPortFree: free([8080]) })).toMatchObject({ port: 8085, notice: null });
    expect(await choosePort({ remembered: 8085, isPortFree: free([8080, 8085]) })).toMatchObject({ port: 8081 });
  });
});
