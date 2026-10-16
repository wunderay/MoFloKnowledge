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
import type { FieldCandidate } from "../../src/worker/model/schema";
import type { PageExtractor } from "../../src/worker/model/responses";
import type { RenderResult } from "../../src/contracts/render-task";
async function main() {
  if (process.env.NODE_ENV !== "test")
    throw new Error("This harness requires NODE_ENV=test.");
  const connectionString = process.env.WORKER_DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Provide the dedicated disposable worker login through WORKER_DATABASE_URL.",
    );
  const port = Number(process.env.MOFLO_TEST_FIXTURE_PORT ?? 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid controlled fixture port.");
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
    )
      throw new Error(
        "This test harness accepts only its exact controlled website.",
      );
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
    if (!document) throw new Error("No finalized fixture HTTP body.");
    const $ = load(document.body.toString("utf8"));
    $('script,style,noscript,template,[hidden],[aria-hidden="true"]').remove();
    if (new URL(task.url).pathname === "/faq.html")
      $("#faq").text(
        [
          ...faqScript.matchAll(
            /(?:heading|answer|hostile)\.textContent\s*=\s*"([^"]+)"/g,
          ),
        ]
          .map((match) => match[1])
          .join("\n"),
      );
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
  const extractor: PageExtractor = {
    model: "recorded-controlled-fixture-1",
    async extract(page, observations) {
      const result: FieldCandidate[] = [];
      const path = new URL(page.capture.finalUrl).pathname;
      function add(
        field: string,
        value: unknown,
        needles: string[],
        extra: Partial<FieldCandidate> = {},
      ) {
        const segments = needles.map((needle) => {
          const segment = page.capture.segments.find((s) =>
            s.text.includes(needle),
          );
          if (!segment)
            throw new Error("Recorded fixture evidence changed: " + needle);
          return segment.id;
        });
        result.push({
          field,
          value,
          entity_key: null,
          origin: "source_backed",
          segment_ids: [...new Set(segments)],
          observation_ids: [],
          supporting_fields: [],
          note: null,
          ...extra,
        });
      }
      if (path === "/") {
        const overview = page.capture.segments.find((s) =>
          s.text.includes("Northstar Fieldworks designs and builds"),
        )!.text;
        add("/company_foundation/overview", overview, [
          "Northstar Fieldworks designs and builds",
        ]);
        add(
          "/company_foundation/business_model",
          "designs and builds field monitoring tools",
          ["Northstar Fieldworks designs and builds"],
        );
        add(
          "/company_foundation/employee_count",
          { raw: "25–50 people", exact: null, min: 25, max: 50, as_of: null },
          ["25–50 people"],
        );
        add(
          "/company_foundation/service_locations",
          [{ text: "Pacific Northwest" }, { text: "Great Lakes region" }],
          ["Pacific Northwest"],
        );
        add(
          "/market_and_customers/target_buyers",
          [
            { text: "community water teams" },
            { text: "watershed groups" },
            { text: "small utilities" },
          ],
          ["Northstar Fieldworks designs and builds"],
        );
        add(
          "/positioning/company_pitch",
          "Practical water data tools for community teams.",
          ["Northstar Fieldworks designs and builds"],
          {
            origin: "generated",
            supporting_fields: [
              "/company_foundation/business_model",
              "/market_and_customers/target_buyers",
            ],
            note: "Recorded fixture suggestion grounded in the company overview.",
          },
        );
        add(
          "/branding_and_style/writing_style_description",
          "Concise and practical technical language.",
          ["Northstar Fieldworks designs and builds"],
          {
            origin: "inferred",
            note: "Recorded fixture interpretation of the visible wording.",
          },
        );
        add(
          "/company_foundation/main_address",
          {
            label: null,
            raw: "400 River Street, Portland, OR 97204, USA",
            line1: "400 River Street",
            line2: null,
            city: "Portland",
            region: "OR",
            postal_code: "97204",
            country: "USA",
          },
          ["400 River Street"],
        );
        const social = page.capture.links.find(
          (link) =>
            link.url === "https://linkedin.com/company/northstarfieldworks",
        );
        if (social) {
          const observation = observations.find(
            (o) => o.property === "href" && o.value === social.url,
          )!;
          add(
            "/online_presence/social_media_links",
            [{ platform: "linkedin", profile_url: social.url }],
            [],
            { observation_ids: [observation.id] },
          );
        }
      }
      if (path === "/contact.html")
        add(
          "/company_foundation/main_address",
          {
            label: null,
            raw: "20 Bridge Avenue",
            line1: "20 Bridge Avenue",
            line2: null,
            city: "Portland",
            region: "OR",
            postal_code: "97205",
            country: "United States",
          },
          ["20 Bridge Avenue", "Portland, OR 97205", "United States"],
        );
      if (path === "/about.html") {
        const name = page.capture.segments.find((s) =>
          s.text.includes("Riley Chen"),
        )!;
        const entity_key = page.capture.finalUrl + "|Riley Chen|" + name.id;
        add("/key_people/@id/name", "Riley Chen", ["Riley Chen"], {
          entity_key,
        });
        add(
          "/key_people/@id/title",
          "Director of Field Programs",
          ["Director of Field Programs"],
          { entity_key },
        );
      }
      if (path === "/pricing.html") {
        const name = page.capture.segments.find((s) =>
          s.text.includes("CreekWatch Kit"),
        )!;
        const entity_key = page.capture.finalUrl + "|CreekWatch Kit|" + name.id;
        add("/offerings/@id/name", "CreekWatch Kit", ["CreekWatch Kit"], {
          entity_key,
        });
        add(
          "/offerings/@id/description",
          "A portable sensor kit for teams sampling streams and ponds.",
          ["A portable sensor kit"],
          { entity_key },
        );
        add(
          "/offerings/@id/features",
          [
            { text: "Temperature and conductivity probes" },
            { text: "Weather-resistant carrying case" },
          ],
          [
            "Temperature and conductivity probes",
            "Weather-resistant carrying case",
          ],
          { entity_key },
        );
        add(
          "/offerings/@id/pricing",
          {
            kind: "paid",
            raw: "Starting at $1,200 per kit. Annual dashboard access is $240.",
            amount: "1200",
            min_amount: null,
            max_amount: null,
            currency: null,
            billing_interval: null,
            pricing_model: "per kit",
            qualifications: [],
            as_of: null,
          },
          ["Starting at $1,200"],
          { entity_key },
        );
        add("/offerings/@id/url", page.capture.finalUrl, ["CreekWatch Kit"], {
          entity_key,
        });
      }
      return { candidates: result, limitations: [], tokensUsed: 1000 };
    },
  };
  const repository = new PostgresJobRepository({ connectionString });
  const stop = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => stop.abort("shutdown"));
  console.log(
    "Controlled recorded worker ready; production network/model/renderer qualification is not implied.",
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
        await extractAndFinish(job, repository, crawl, signal, extractor);
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
