// Tiny single-origin gateway for the all-in-one local image.
//   /auth/v1  -> GoTrue        /rest/v1 -> PostgREST        everything else -> the Next.js app
// It always listens on 8080 inside the container; the host port it is published on (MOFLO_PORT) is only docker-compose's concern.
// The Next server reaches Supabase through it, and the browser reaches the app and the auth links through it, on the same origin.
import http from "node:http";

const port = Number(process.env.GATEWAY_PORT ?? 8080);
const host = process.env.GATEWAY_HOST ?? "0.0.0.0";
const web = Number(process.env.WEB_PORT ?? 3001);
const routes = [
  ["/auth/v1", Number(process.env.GOTRUE_PORT ?? 9999)],
  ["/rest/v1", Number(process.env.POSTGREST_PORT ?? 3000)],
];

http
  .createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/__gateway/health") {
      res.end("ok");
      return;
    }
    const hit = routes.find(([p]) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"));
    const [prefix, target] = hit ?? ["", web];
    let path = url.slice(prefix.length) || "/";
    if (path.startsWith("?")) {
      path = "/" + path;
    }
    const headers = { ...req.headers };
    // supabase-js sends the publishable key as `apikey`; with no bearer token, use it as one (Supabase's own gateway does the same).
    if (hit && !headers.authorization && headers.apikey) {
      headers.authorization = "Bearer " + headers.apikey;
    }
    const upstream = http.request({ host: "127.0.0.1", port: target, method: req.method, path, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    upstream.on("error", (e) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ message: "upstream unavailable: " + e.code }));
    });
    req.pipe(upstream);
  })
  .listen(port, host, () => {
    console.log(`gateway listening on ${host}:${port}`);
  });
