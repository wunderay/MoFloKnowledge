// Smoke test for the running local stack (docker compose up, or deploy/local/entrypoint.sh). Needs Node 22 and nothing else.
//   node deploy/local/smoke.mjs --log app.log        (app.log: the output of `docker compose logs --no-log-prefix app`)
//   SMOKE_EMAIL=... SMOKE_PASSWORD=... node deploy/local/smoke.mjs
// It checks what a person does: the sign-in page loads, the demo login works, a company can be created through the app's
// HTTP API, and the worker claims the crawl job that creating it queued. SMOKE_BASE_URL defaults to http://localhost:$MOFLO_PORT (8080 when unset).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.env.SMOKE_BASE_URL ?? `http://localhost:${process.env.MOFLO_PORT ?? 8080}`;
const website = process.env.SMOKE_WEBSITE ?? "https://example.com/";
const claimSeconds = Number(process.env.SMOKE_CLAIM_SECONDS ?? 180);

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
}
const pass = (message) => console.log(`ok - ${message}`);

function login() {
  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    return { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD };
  }
  const file = process.argv[process.argv.indexOf("--log") + 1];
  if (process.argv.includes("--log") && file) {
    const match = /log in as (\S+) \/ (\S+)/.exec(readFileSync(file, "utf8").split("\n").filter((line) => line.includes("Open http")).at(-1) ?? "");
    if (match) {
      return { email: match[1], password: match[2] };
    }
  }
  return fail("no demo login: pass --log <container log> or SMOKE_EMAIL and SMOKE_PASSWORD");
}

const cookies = new Map();
async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      origin: base,
      ...(body ? { "content-type": "application/json" } : {}),
      cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return { status: response.status, text: await response.text() };
}
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const page = await call("GET", "/sign-in");
page.status === 200 && /sign/i.test(page.text) ? pass("the sign-in page loads") : fail(`GET /sign-in -> ${page.status}`);

const { email, password } = login();
const signIn = await call("POST", "/api/auth/sign-in", { email, password });
signIn.status === 200 && parse(signIn.text)?.data?.signedIn === true ? pass(`signed in as ${email}`) : fail(`sign-in -> ${signIn.status} ${signIn.text}`);

const created = await call("POST", "/api/companies", { name: "Smoke Test Company", website, requestId: randomUUID() });
const company = parse(created.text)?.data;
created.status === 201 && company?.companyId ? pass(`created a company (${company.companyId})`) : fail(`create company -> ${created.status} ${created.text}`);
company.jobId ? pass(`its first crawl was queued (job ${company.jobId})`) : fail("creating the company did not queue a crawl");

// Queued means no worker has taken it; anything else means the worker claimed it (a crawl of an unreachable site may still end failed).
const deadline = Date.now() + claimSeconds * 1000;
let status = "queued";
while (Date.now() < deadline) {
  const job = await call("GET", `/api/companies/${company.companyId}/scrapes/${company.jobId}`);
  status = parse(job.text)?.data?.status ?? `http ${job.status}`;
  if (status !== "queued" && !status.startsWith("http")) {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
status !== "queued" && !status.startsWith("http") ? pass(`the worker claimed the crawl (status: ${status})`) : fail(`the crawl was not claimed within ${claimSeconds}s (status: ${status})`);
console.log("SMOKE PASS");
