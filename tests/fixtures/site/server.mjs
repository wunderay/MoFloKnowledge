import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.MOFLO_FIXTURE_PORT ?? 4173);
const routes = new Map([
  ["/", ["home.html", "text/html; charset=utf-8"]],
  ["/about.html", ["about.html", "text/html; charset=utf-8"]],
  ["/pricing.html", ["pricing.html", "text/html; charset=utf-8"]],
  ["/contact.html", ["contact.html", "text/html; charset=utf-8"]],
  ["/faq.html", ["faq.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/logo.svg", ["logo.svg", "image/svg+xml"]],
  ["/faq.js", ["faq.js", "text/javascript; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname === "/careers.html") {
    response.writeHead(503, { "content-type": "text/plain; charset=utf-8", "retry-after": "1" });
    response.end("Fixture route intentionally unavailable for partial-coverage tests.");
    return;
  }
  if (url.pathname === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("User-agent: *\nAllow: /\nDisallow: /private\n");
    return;
  }
  const entry = routes.get(url.pathname);
  if (!entry || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(join(root, entry[0]));
    response.writeHead(200, { "content-type": entry[1], "content-length": body.length, "cache-control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end("Fixture read failed");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Fixture server listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
