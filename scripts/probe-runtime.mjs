import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { chromium } from "playwright-core";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const pinnedNode = (await readFile(new URL("../.nvmrc", import.meta.url), "utf8").catch(() => "")).trim();
const hostId = process.env.MOFLO_OWNER_SELECTED_HOST_ID;
const sampleUrl = process.env.MOFLO_RUNTIME_SAMPLE_URL;
const chromiumPath = resolve(process.env.CHROMIUM_PATH ?? "/usr/bin/chromium");
const proxyUrl = process.env.OUTBOUND_PROXY_URL;
const model = process.env.OPENAI_MODEL;
const report = {
  checkedAt: new Date().toISOString(),
  hostId: hostId ?? null,
  runtime: { actual: process.versions.node, pinned: pinnedNode || packageJson.engines.node, status: process.versions.node.startsWith("22.") ? "compatible_node22" : "incompatible" },
  chromium: { pathConfigured: existsSync(chromiumPath), samplePage: "NOT_RUN" },
  model: { configured: Boolean(model && process.env.OPENAI_API_KEY), strictOutput: "NOT_RUN" },
  boundary: "NOT_PROVEN",
  overall: "NOT_PROVEN",
};
const missing = [];
if (!hostId) missing.push("MOFLO_OWNER_SELECTED_HOST_ID");
if (!sampleUrl) missing.push("MOFLO_RUNTIME_SAMPLE_URL");
if (!proxyUrl) missing.push("OUTBOUND_PROXY_URL");
if (!existsSync(chromiumPath)) missing.push("CHROMIUM_PATH");
if (!model || !process.env.OPENAI_API_KEY) missing.push("OPENAI_MODEL and OPENAI_API_KEY");

if (report.runtime.status === "compatible_node22" && sampleUrl && proxyUrl && existsSync(chromiumPath)) {
  let browser;
  try {
    const browserEnv = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TZ"].flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      timeout: 25_000,
      proxy: { server: proxyUrl },
      env: browserEnv,
    });
    const page = await browser.newPage();
    const response = await page.goto(sampleUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
    report.chromium.samplePage = response && response.status() < 400 ? "loaded" : "failed_http";
  } catch {
    report.chromium.samplePage = "failed";
  } finally {
    await browser?.close().catch(() => {});
  }
} else if (sampleUrl && proxyUrl && report.runtime.status !== "compatible_node22") {
  report.chromium.samplePage = "not_run_incompatible_node";
}

if (model && process.env.OPENAI_API_KEY) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 0 });
    const response = await client.responses.create({
      model,
      input: "Return exactly the requested JSON for this safe compatibility sample. The word in the fixture is meadow.",
      max_output_tokens: 64,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "runtime_compatibility_sample",
          strict: true,
          schema: { type: "object", properties: { observed: { type: "string" } }, required: ["observed"], additionalProperties: false },
        },
      },
    });
    const parsed = response.status === "completed" && response.output_text ? JSON.parse(response.output_text) : null;
    report.model.strictOutput = parsed?.observed === "meadow" ? "completed" : response.status === "incomplete" ? "incomplete" : "unsupported_or_invalid";
    report.model.model = model;
  } catch {
    report.model.strictOutput = "request_failed";
    report.model.model = model;
  }
}

const samplePassed = report.runtime.status === "compatible_node22" && report.chromium.samplePage === "loaded" && report.model.strictOutput === "completed";
if (!hostId) missing.push("owner-selected host identity");
if (samplePassed) report.sampleCapability = "PROVEN_FOR_THIS_SAMPLE_ONLY";
report.missingConfiguration = [...new Set(missing)];
report.notes = [
  "A sample render does not qualify renderer isolation or network confinement.",
  "An independently evidenced private renderer service and enforced proxy/firewall remain required before arbitrary URLs are enabled.",
];
console.log(JSON.stringify(report));
if (!samplePassed || report.boundary !== "PROVEN") process.exitCode = 2;
