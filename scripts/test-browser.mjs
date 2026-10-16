import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const timeoutMs = Number(process.env.MOFLO_E2E_TIMEOUT_MS ?? 180_000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
  throw new Error("MOFLO_E2E_TIMEOUT_MS must be an integer from 1000 to 600000");
}
const lockPath = join(tmpdir(), "mofloknowledge-playwright.lock");
const cliPath = resolve("node_modules/@playwright/test/cli.js");
const forwarded = process.argv.slice(2);
const child = spawn("flock", ["-n", lockPath, process.execPath, cliPath, "test", ...forwarded], {
  stdio: "inherit",
  env: process.env,
});
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
}, timeoutMs);
const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
});
clearTimeout(timer);
if (timedOut) {
  console.error(`Browser run exceeded ${timeoutMs}ms and was terminated`);
  process.exitCode = 124;
} else if (exitCode !== 0) {
  process.exitCode = exitCode;
}
