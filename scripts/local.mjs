// `npm run local`: run the whole app with Docker Compose and open http://localhost:8080.
//   npm run local            build, start, wait until healthy, print the demo login, open the browser
//   npm run local -- --stop  stop it (the data stays)
//   npm run local -- --reset stop it and delete its data volume
// Works on Windows, macOS and Linux. start.sh and start.cmd do the same without Node.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const url = "http://localhost:8080";

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

/** The last "Open <url> — log in as <email> / <password>" line the container printed. */
export function findLogin(logText) {
  const lines = logText.split(/\r?\n/).filter((line) => /Open http\S+ .{1,3} log in as /.test(line));
  const line = lines.at(-1);
  return line ? line.slice(line.indexOf("Open ")) : null;
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

function main() {
  const { mode, open } = parseArgs(process.argv.slice(2));
  if (spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status !== 0) {
    console.error("Docker with Compose is required. Install Docker Desktop (Windows, macOS) or Docker Engine (Linux), start it, and run this again.");
    process.exit(1);
  }
  const result = docker(composeArgs(mode));
  if (result.status !== 0) {
    console.error("Docker Compose failed (output above). Is Docker running? If port 8080 is busy, free it and try again.");
    process.exit(result.status ?? 1);
  }
  if (mode !== "start") {
    console.log(mode === "reset" ? "Stopped and deleted the local data." : "Stopped. Run npm run local to start again; your data is kept.");
    return;
  }
  const logs = spawnSync("docker", ["compose", "logs", "--no-log-prefix", "app"], { encoding: "utf8" });
  console.log(`\n${findLogin(logs.stdout ?? "") ?? `Open ${url}`}\n`);
  if (open) {
    openBrowser(url);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
