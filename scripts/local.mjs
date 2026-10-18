// `npm run local`: run the whole app with Docker Compose and open it (http://localhost:8080, or the next free port up to 8099).
// MOFLO_PORT=9090 npm run local uses exactly that port instead. The port picked for a busy 8080 is kept in .moflo-port.
//   npm run local            build, start, wait until healthy, print the demo login, open the browser
//   npm run local -- --stop  stop it (the data stays)
//   npm run local -- --reset stop it and delete its data volume
// Works on Windows, macOS and Linux; starts Docker Desktop first if it is installed but not running. start.sh and start.cmd do the same without Node.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8080;
const FALLBACK_RANGE = [8081, 8099];
const portFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".moflo-port");

export function parseArgs(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const unknown = flags.find((flag) => !["--stop", "--reset", "--no-open"].includes(flag));
  if (unknown || argv.length !== flags.length) {
    throw new Error(`Unknown argument ${unknown ?? argv.find((arg) => !arg.startsWith("--"))}. Use --stop, --reset or --no-open.`);
  }
  const mode = flags.includes("--reset") ? "reset" : flags.includes("--stop") ? "stop" : "start";
  return { mode, open: !flags.includes("--no-open") };
}

export function composeArgs(mode) {
  if (mode === "stop") {
    return ["compose", "down"];
  }
  if (mode === "reset") {
    return ["compose", "down", "--volumes"];
  }
  return ["compose", "up", "--build", "--detach", "--wait", "--wait-timeout", "900"];
}

/** A port number from text (an environment variable, a file); null when it is not an integer from 1 to 65535. */
export function parsePort(text) {
  const value = String(text ?? "").trim();
  const port = /^\d{1,5}$/.test(value) ? Number(value) : 0;
  return port >= 1 && port <= 65535 ? port : null;
}

/** The host port in the output of `docker compose port app 8080` (for example "127.0.0.1:8080"); null when nothing is published. */
export function publishedPort(output) {
  return parsePort(/:(\d+)\s*$/m.exec(String(output ?? ""))?.[1]);
}

/** Resolves true when nothing is listening on the port, on the address Docker publishes it on. */
export function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/** The first port that `isFree` accepts: `preferred` first, then `range` ([first, last], inclusive) in order. Throws when all are taken. */
export async function pickPort({ isFree, preferred = DEFAULT_PORT, range = FALLBACK_RANGE }) {
  const [first, last] = range;
  const candidates = [preferred];
  for (let port = first; port <= last; port += 1) {
    if (port !== preferred) {
      candidates.push(port);
    }
  }
  for (const port of candidates) {
    if (await isFree(port)) {
      return port;
    }
  }
  throw new Error(`Ports ${preferred} and ${first}-${last} are all in use. Free one, or set MOFLO_PORT to a port that is free.`);
}

/**
 * Which host port to start on. `explicit` is MOFLO_PORT as the user set it (used as given or refused, never replaced),
 * `own` is the port this app's running container already publishes (its own port is not "in use"), `remembered` is the
 * port kept from an earlier run that had to move off 8080. Returns { port, explicit, notice }.
 */
export async function choosePort({ explicit, own, remembered, isPortFree: portFree }) {
  const isFree = async (port) => port === own || (await portFree(port));
  if (explicit !== undefined && explicit !== "") {
    const port = parsePort(explicit);
    if (port === null) {
      throw new Error(`MOFLO_PORT must be a port number between 1 and 65535 (got "${explicit}").`);
    }
    if (!(await isFree(port))) {
      throw new Error(`Port ${port} (MOFLO_PORT) is in use. Stop what is using it, or set MOFLO_PORT to a free port, for example MOFLO_PORT=9090.`);
    }
    return { port, explicit: true, notice: null };
  }
  if (own) {
    return { port: own, explicit: false, notice: null };
  }
  if (remembered && (await isFree(remembered))) {
    return { port: remembered, explicit: false, notice: null };
  }
  const port = await pickPort({ isFree });
  return { port, explicit: false, notice: port === DEFAULT_PORT ? null : `Port ${DEFAULT_PORT} is in use; using ${port} instead.` };
}

/** The last "Open <url> - log in as <email> / <password>" line the container printed. */
export function findLogin(logText) {
  const lines = logText.split(/\r?\n/).filter((line) => /Open http\S+ .{1,3} log in as /.test(line));
  const line = lines.at(-1);
  return line ? line.slice(line.indexOf("Open ")) : null;
}

/** Polls `probe` every `intervalMs` until it is true or `timeoutMs` has passed; resolves true when ready. */
export async function waitForDocker({ probe, sleep, timeoutMs = 180000, intervalMs = 3000, onWait = () => {} }) {
  for (let waited = 0; ; waited += intervalMs) {
    if (probe()) {
      return true;
    }
    if (waited >= timeoutMs) {
      return false;
    }
    onWait();
    await sleep(intervalMs);
  }
}

function dockerReady() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

/** Starts Docker Desktop where it can be started without elevated rights; false when there is nothing to start. */
function startDockerDesktop() {
  if (process.platform === "darwin") {
    return spawnSync("open", ["-a", "Docker"], { stdio: "ignore" }).status === 0;
  }
  const exe = join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");
  if (process.platform !== "win32" || !existsSync(exe)) {
    return false;
  }
  spawn(exe, [], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  return true;
}

async function ensureDocker() {
  if (spawnSync("docker", ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("Docker is not installed. Install Docker Desktop (Windows, macOS) or Docker Engine (Linux): https://docs.docker.com/get-started/get-docker/");
    process.exit(1);
  }
  if (dockerReady()) {
    return;
  }
  if (process.platform === "linux") {
    console.error("Docker is not running. Start Docker (for example: sudo systemctl start docker) and run this again.");
    process.exit(1);
  }
  console.log("Docker is not running - starting Docker Desktop...");
  if (!startDockerDesktop()) {
    console.error("Docker Desktop was not found. Start Docker and run this again.");
    process.exit(1);
  }
  const ready = await waitForDocker({
    probe: dockerReady,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onWait: () => process.stdout.write("."),
  });
  console.log("");
  if (!ready) {
    console.error("Docker did not start within 3 minutes. Open Docker Desktop, wait until it says Engine running, then run this again.");
    process.exit(1);
  }
}

function openBrowser(target) {
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : process.platform === "darwin" ? ["open", [target]] : ["xdg-open", [target]];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // No browser to open (for example a server): the URL is printed anyway.
  }
}

function docker(args, options = {}) {
  return spawnSync("docker", args, { stdio: "inherit", ...options });
}

function readRememberedPort() {
  try {
    return parsePort(readFileSync(portFile, "utf8"));
  } catch {
    return null;
  }
}

/** Keeps a fallback port for the next run so the address stays the same; 8080 needs no file. */
function rememberPort(port) {
  try {
    if (port === DEFAULT_PORT) {
      rmSync(portFile, { force: true });
    } else {
      writeFileSync(portFile, `${port}\n`);
    }
  } catch {
    // Not being able to remember the port only means the next run may pick again.
  }
}

async function main() {
  const { mode, open } = parseArgs(process.argv.slice(2));
  await ensureDocker();
  if (spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status !== 0) {
    console.error("Docker with Compose is required. Update Docker Desktop (Windows, macOS) or install the Docker Compose plugin (Linux), and run this again.");
    process.exit(1);
  }
  let port = DEFAULT_PORT;
  let chosen = null;
  if (mode === "start") {
    const own = publishedPort(spawnSync("docker", ["compose", "port", "app", "8080"], { encoding: "utf8" }).stdout);
    chosen = await choosePort({ explicit: process.env.MOFLO_PORT, own, remembered: readRememberedPort(), isPortFree });
    port = chosen.port;
    if (chosen.notice) {
      console.log(chosen.notice);
    }
  }
  const result = docker(composeArgs(mode), { env: { ...process.env, MOFLO_PORT: String(port) } });
  if (result.status !== 0) {
    console.error(
      mode === "start"
        ? `Docker Compose failed (output above). Is Docker running? If it says port ${port} is in use, free it or pick another with MOFLO_PORT, for example MOFLO_PORT=9090 npm run local.`
        : "Docker Compose failed (output above). Is Docker running?",
    );
    process.exit(result.status ?? 1);
  }
  if (mode !== "start") {
    console.log(mode === "reset" ? "Stopped and deleted the local data." : "Stopped. Run npm run local to start again; your data is kept.");
    return;
  }
  if (!chosen?.explicit) {
    rememberPort(port);
  }
  const url = `http://localhost:${port}`;
  const logs = spawnSync("docker", ["compose", "logs", "--no-log-prefix", "app"], { encoding: "utf8" });
  console.log(`\n${findLogin(logs.stdout ?? "") ?? `Open ${url}`}\n`);
  if (open) {
    openBrowser(url);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
