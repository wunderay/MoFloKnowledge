// Secrets for the all-in-one local stack. Generated once, on the first start, inside the container, kept in the data volume
// and reused afterwards: `node secrets.mjs /path/to/secrets.env` creates the file when it is missing and never rewrites it.
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const b64url = (input) => Buffer.from(input).toString("base64url");
const randomToken = (bytes, random) => b64url(random(bytes));

/** A Supabase-style publishable key: an HS256 JWT with role "anon", signed with the JWT secret. */
export function signAnonKey(jwtSecret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ role: "anon", iss: "supabase-local", iat: nowSeconds, exp: nowSeconds + 10 * 365 * 86400 }));
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function generateSecrets({ random = randomBytes, nowSeconds } = {}) {
  const JWT_SECRET = randomToken(48, random);
  return {
    JWT_SECRET,
    ANON_KEY: signAnonKey(JWT_SECRET, nowSeconds),
    PG_SUPER_PASSWORD: randomToken(24, random),
    AUTH_ADMIN_PASSWORD: randomToken(24, random),
    AUTHENTICATOR_PASSWORD: randomToken(24, random),
    WORKER_PASSWORD: randomToken(24, random),
    DEMO_EMAIL: "demo@local.test",
    DEMO_PASSWORD: randomToken(18, random),
  };
}

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      values[match[1]] = match[2];
    }
  }
  return values;
}

export function serializeEnv(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join("");
}

/** Reuses the file when it exists (filling in any key it lacks, the anon key from the stored JWT secret); otherwise creates it. */
export function loadOrCreateSecrets(file, options = {}) {
  const existing = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const generated = generateSecrets(options);
  const merged = { ...generated, ...existing };
  if (!existing.ANON_KEY && existing.JWT_SECRET) {
    merged.ANON_KEY = signAnonKey(existing.JWT_SECRET, options.nowSeconds);
  }
  const created = Object.keys(merged).some((key) => !(key in existing));
  if (created) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serializeEnv(merged), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return { secrets: merged, created };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node secrets.mjs <secrets.env>");
    process.exit(2);
  }
  const { created } = loadOrCreateSecrets(file);
  console.log(created ? `generated ${file}` : `reusing ${file}`);
}
