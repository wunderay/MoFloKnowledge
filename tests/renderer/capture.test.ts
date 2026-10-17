import { it, expect } from "vitest";
import { chromium } from "playwright-core";
import { captureRenderedPage } from "../../src/renderer/capture";
import { RenderResultSchema } from "../../src/contracts/render-task";
import { captureHtml } from "../../src/worker/capture/html";
it("captures actual JS-visible content and separate style/font/logo observations in fresh contexts", async () => {
  // Controlled network-free fixture only. This explicitly does not prove production sandbox/egress.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addCookies([
      { name: "session", value: "fixture", url: "https://example.com" },
    ]);
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(
      '<style>body { font-family: Arial; color: rgb(10,20,30) } button { background: #ffee00 }</style><header><img alt="Acme logo" src="https://example.com/logo.svg"></header><main><h1>Start</h1><button>Try it</button></main><script>document.querySelector("h1").textContent="JS company";localStorage.setItem("secret","value")</script>',
    );
    await page.evaluate(() => {
      document.title = "Dynamic company title";
      const meta = document.createElement("meta");
      meta.name = "author";
      meta.content = "Observed Author";
      document.head.append(meta);
      const structured = document.createElement("script");
      structured.type = "application/ld+json";
      structured.textContent = JSON.stringify({
        "@type": "Organization",
        name: "Dynamic Company",
      });
      document.head.append(structured);
      const header = document.querySelector("header")!;
      const link = document.createElement("a");
      link.href = "https://example.com/dynamic-pricing";
      link.textContent = "Book a dynamic demo";
      header.append(link);
      const hidden = document.createElement("a");
      hidden.href = "https://example.com/hidden";
      hidden.textContent = "Hidden action";
      hidden.hidden = true;
      header.append(hidden);
      const footer = document.createElement("footer");
      const address = document.createElement("address");
      address.textContent = "42 Dynamic Street";
      footer.append(address);
      document.body.append(footer);
      const form = document.createElement("form");
      form.action = "https://example.com/request-demo";
      form.method = "POST";
      const label = document.createElement("label");
      label.textContent = "Work email";
      const button = document.createElement("button");
      button.type = "submit";
      button.textContent = "Request dynamic demo";
      form.append(label, button);
      document.querySelector("main")!.append(form);
    });
    const capture = await captureRenderedPage(page);
    expect(capture.text).toContain("JS company");
    expect(
      capture.styles.find((style) => style.selector.includes("h1"))?.color,
    ).toBe("rgb(10, 20, 30)");
    expect(capture.stylesheets[0]?.declarations).toContain("font-family");
    expect(capture.logos[0]?.url).toBe("https://example.com/logo.svg");
    expect(capture.links).toEqual([
      expect.objectContaining({
        url: "https://example.com/dynamic-pricing",
        label: "Book a dynamic demo",
      }),
    ]);
    expect(capture.forms).toContainEqual(
      expect.objectContaining({
        action: "https://example.com/request-demo",
        method: "POST",
        labels: ["Work email"],
      }),
    );
    expect(capture.ctas).toContainEqual(
      expect.objectContaining({
        label: "Request dynamic demo",
        destination: "https://example.com/request-demo",
      }),
    );
    expect(capture.headings).toContainEqual(
      expect.objectContaining({ level: 1, text: "JS company" }),
    );
    expect(capture.addresses).toContainEqual(
      expect.objectContaining({ text: "42 Dynamic Street" }),
    );
    const rendered = {
      ...capture,
      finalUrl: "https://example.com/",
      resourceBytes: 0,
    };
    expect(RenderResultSchema.parse(rendered)).toEqual(rendered);
    const finalized = captureHtml(
      {
        requestedUrl: "https://example.com/",
        finalUrl: "https://example.com/",
        body: "<main>Initial HTML shell</main>",
      },
      rendered,
    );
    expect(finalized.links).toContainEqual({
      url: "https://example.com/dynamic-pricing",
      label: "Book a dynamic demo",
    });
    expect(
      finalized.segments.some(
        (segment) => segment.text === "42 Dynamic Street",
      ),
    ).toBe(true);
    expect(
      finalized.segments.some(
        (segment) => segment.text === "Book a dynamic demo",
      ),
    ).toBe(true);
    expect(finalized.author).toBe("Observed Author");
    expect(finalized.observations.jsonLd).toEqual([
      { "@type": "Organization", name: "Dynamic Company" },
    ]);
    expect(finalized.text).not.toContain("Hidden action");
    await context.close();
    const fresh = await browser.newContext();
    const next = await fresh.newPage();
    await next.setContent("<main>Fresh</main>");
    expect(await fresh.cookies()).toEqual([]);
    await fresh.close();
  } finally {
    await browser.close();
  }
}, 15000);
