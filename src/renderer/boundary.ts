import { readFile } from 'node:fs/promises';
import { z } from 'zod';
export const BoundaryReportSchema = z.object({ schemaVersion: z.literal(1), rendererUid: z.number().int().positive(), qualified: z.literal(true), checkedAt: z.string().datetime(), expiresAt: z.string().datetime(), proxyOnlyEgress: z.literal(true), directTcpBlocked: z.literal(true), directUdpBlocked: z.literal(true), directDnsBlocked: z.literal(true), sandbox: z.literal(true), secretless: z.literal(true), mountIsolation: z.literal(true), evidence: z.array(z.string().min(1)).min(1) }).passthrough();
export async function requireQualifiedBoundary(path: string | undefined): Promise<void> {
    if (!path) {
      throw new Error('RENDERER_BOUNDARY_NOT_QUALIFIED: real host confinement report required');
    }
    const report = BoundaryReportSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (process.getuid?.() !== report.rendererUid) {
      throw new Error('RENDERER_BOUNDARY_NOT_QUALIFIED: renderer uid does not match host evidence');
    }
    if (Date.parse(report.checkedAt) > Date.now() || Date.parse(report.expiresAt) <= Date.now()) {
      throw new Error('RENDERER_BOUNDARY_NOT_QUALIFIED: stale host evidence');
    }
}
