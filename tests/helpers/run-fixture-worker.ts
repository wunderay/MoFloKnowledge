/** Explicit controlled integration harness. Production entry points never import this file. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "cheerio";
import { PostgresJobRepository } from "../../src/worker/job-repository";
import { runWorker } from "../../src/worker/run-loop";
import { runCrawl } from "../../src/worker/crawl/run-crawl";
import { extractAndFinish } from "../../src/worker/extract/pipeline";
import {
  createPinnedFetcher,
  type FetchResult,
} from "../../src/worker/network/pinned-transport";
import type { RenderResult } from "../../src/contracts/render-task";
async function main() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("This harness requires NODE_ENV=test.");
  }
  const connectionString = process.env.WORKER_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Provide the dedicated disposable worker login through WORKER_DATABASE_URL.",
    );
  }
  const port = Number(process.env.MOFLO_TEST_FIXTURE_PORT ?? 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Invalid controlled fixture port.");
  }
  const allowedPaths = new Set([
    "/",
    "/robots.txt",
    "/about.html",
    "/contact.html",
    "/pricing.html",
    "/faq.html",
    "/careers.html",
    "/style.css",
    "/logo.svg",
    "/faq.js",
  ]);
  const transport = createPinnedFetcher(async (input) => {
    const url = new URL(input);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "example.com" ||
      !allowedPaths.has(url.pathname)
    ) {
      throw new Error(
        "This test harness accepts only its exact controlled website.",
      );
    }
    url.port = String(port);
    return { url, addresses: [{ address: "127.0.0.1", family: 4 }] };
  });
  const fetched = new Map<string, FetchResult>();
  const fetcher: typeof transport = async (input, options) => {
    const result = await transport(input, options);
    fetched.set(result.finalUrl, result);
    return result;
  };
  const stylesheet = await readFile(
    resolve("tests/fixtures/site/style.css"),
    "utf8",
  );
  const faqScript = await readFile(
    resolve("tests/fixtures/site/faq.js"),
    "utf8",
  );
  const renderer = async (task: { url: string }): Promise<RenderResult> => {
    const document = fetched.get(task.url);
    if (!document) {
      throw new Error("No finalized fixture HTTP body.");
    }
    const $ = load(document.body.toString("utf8"));
    $('script,style,noscript,template,[hidden],[aria-hidden="true"]').remove();
    if (new URL(task.url).pathname === "/faq.html") {
      $("#faq").text(
        [
          ...faqScript.matchAll(
            /(?:heading|answer|hostile)\.textContent\s*=\s*"([^"]+)"/g,
          ),
        ]
          .map((match) => match[1])
          .join("\n"),
      );
    }
    $("br").replaceWith("\n");
    $("p,li,h1,h2,h3,article,section,address,header,footer").append("\n");
    return {
      finalUrl: task.url,
      text: $("body")
        .text()
        .replace(/[\t ]+/g, " ")
        .replace(/\n\s*\n/g, "\n")
        .trim(),
      styles: [
        {
          selector: "body",
          evidenceId: "body-style",
          fontFamily: '"Field Sans", Arial, sans-serif',
          fontSize: "16px",
          fontWeight: "400",
          color: "rgb(23, 35, 31)",
          backgroundColor: "rgb(255, 255, 255)",
        },
        {
          selector: "h1",
          evidenceId: "heading-style",
          fontFamily: '"Field Sans", Arial, sans-serif',
          fontSize: "32px",
          fontWeight: "700",
          color: "rgb(36, 92, 75)",
          backgroundColor: "rgba(0, 0, 0, 0)",
        },
      ],
      stylesheets: [
        {
          url: "http://example.com/style.css",
          declarations: stylesheet,
          status: "available",
        },
      ],
      fonts: [],
      logos:
        new URL(task.url).pathname === "/"
          ? [
              {
                url: "http://example.com/logo.svg",
                alt: "Northstar Fieldworks",
                context: "header",
              },
            ]
          : [],
      limitations: [],
      resourceBytes: Buffer.byteLength(stylesheet),
    };
  };
  const repository = new PostgresJobRepository({ connectionString });
  const stop = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => stop.abort("shutdown"));
  }
  console.log(
    "Controlled recorded worker ready; production network/renderer qualification is not implied.",
  );
  try {
    await runWorker(
      repository,
      async (job, signal) => {
        const crawl = await runCrawl(
          job,
          repository,
          signal,
          renderer,
          fetcher,
        );
        await extractAndFinish(job, repository, crawl, signal);
      },
      {
        workerId: "recorded-local-fixture",
        signal: stop.signal,
        onEvent: (event) => process.stdout.write(JSON.stringify(event) + "\n"),
      },
    );
  } finally {
    await repository.close();
  }
}
main().catch((error) => {
  process.stderr.write(
    `Controlled fixture worker stopped: ${error instanceof Error ? error.name : "error"}\n`,
  );
  process.exitCode = 1;
});
