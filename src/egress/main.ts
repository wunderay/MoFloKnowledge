import { createEgressProxy } from './proxy';
const allowed = new Set(['PATH', 'LANG', 'NODE_ENV', 'EGRESS_TOKEN', 'EGRESS_BIND', 'EGRESS_PORT']);
for (const key of Object.keys(process.env)) {
  if (!allowed.has(key)) {
    delete process.env[key];
  }
}
const token = process.env.EGRESS_TOKEN;
if (!token) {
  throw new Error('EGRESS_TOKEN required');
}
const bind = process.env.EGRESS_BIND ?? '127.0.0.1';
createEgressProxy({ token, deniedHosts: [bind] }).listen(Number(process.env.EGRESS_PORT ?? 3128), bind);
