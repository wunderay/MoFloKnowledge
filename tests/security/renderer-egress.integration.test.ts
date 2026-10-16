import { it, expect } from 'vitest';
import { BoundaryReportSchema, requireQualifiedBoundary } from '../../src/renderer/boundary';
it('never treats request hooks or fixture execution as qualified renderer confinement', async () => {
    expect(BoundaryReportSchema.safeParse({ qualified: true, evidence: ['Playwright route interception passed'] }).success).toBe(false);
    await expect(requireQualifiedBoundary(undefined)).rejects.toThrow('NOT_QUALIFIED');
});
// Real topology escape matrix is NOT_PROVEN on this host. The qualification command
// records blocked direct TCP/UDP/DNS, hook-bypassed CSS/font/image/XHR/frame/WS probes,
// sandbox, mounts and secrets. This fail-closed test is not that confinement proof.
