import pg from "pg";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  console.error("NOT_RUN: set TEST_DATABASE_URL to an explicitly disposable PostgreSQL database");
  process.exitCode = 2;
} else {
  const url = new URL(connectionString);
  const urlDatabase = decodeURIComponent(url.pathname.slice(1));
  const expectedDatabase = process.env.TEST_DATABASE_NAME;
  if (!urlDatabase.endsWith("_test")) {
    throw new Error("Refusing DB tests: URL database name must end in _test");
  }
  if (expectedDatabase && urlDatabase !== expectedDatabase) {
    throw new Error("Refusing DB tests: URL database name does not match TEST_DATABASE_NAME");
  }
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  try {
    await client.connect();
    const { rows } = await client.query("select current_database() as database, current_setting('transaction_read_only') as read_only, current_setting('server_version_num') as version");
    if (rows[0]?.database !== urlDatabase) throw new Error("Connected to a database other than the database named in TEST_DATABASE_URL");
    if (rows[0]?.read_only === "on") throw new Error("Refusing DB tests against a read-only connection");
    const testDir = resolve("tests/db");
    let files = [];
    try {
      files = (await readdir(testDir)).filter((file) => file.endsWith(".test.mjs")).sort().map((file) => resolve(testDir, file));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (files.length === 0) {
      console.error("NOT_RUN: no tests/db/*.test.mjs files are present yet");
      process.exitCode = 2;
    } else {
      console.log(JSON.stringify({ status: "connected", database: rows[0].database, serverVersion: rows[0].version, testFiles: files.length }));
      await new Promise((resolveExit, reject) => {
        const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], { stdio: "inherit", env: process.env });
        child.once("error", reject);
        child.once("exit", (code) => resolveExit(code ?? 1));
      }).then((code) => { process.exitCode = code; });
    }
  } finally {
    await client.end();
  }
}
