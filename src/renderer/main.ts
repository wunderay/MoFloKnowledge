import { Renderer } from './render';
import { createTaskServer } from './task-server';
const allowed = new Set(['PATH', 'LANG', 'NODE_ENV', 'RENDERER_TOKEN', 'RENDERER_BIND', 'RENDERER_PORT', 'RENDERER_BOUNDARY_REPORT', 'EGRESS_URL', 'EGRESS_TOKEN', 'CHROMIUM_PATH']);
for (const key of Object.keys(process.env)) {
  if (!allowed.has(key)) {
    delete process.env[key];
  }
}
const token = process.env.RENDERER_TOKEN, proxyToken = process.env.EGRESS_TOKEN, proxyUrl = process.env.EGRESS_URL, boundaryReportPath = process.env.RENDERER_BOUNDARY_REPORT;
if (!token || !proxyToken || !proxyUrl || !boundaryReportPath) {
  throw new Error('Private renderer configuration and qualified boundary report required');
}
const renderer = new Renderer({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', proxyToken, proxyUrl, boundaryReportPath });
const server = createTaskServer(token, (task, signal) => renderer.render(task, signal));
server.requestTimeout = 25000;
server.headersTimeout = 10000;
server.listen(Number(process.env.RENDERER_PORT ?? 3002), process.env.RENDERER_BIND ?? '127.0.0.1');
for (const event of ['SIGINT', 'SIGTERM'] as const) {
  process.once(event, () => { server.close(); void renderer.close(); });
}
