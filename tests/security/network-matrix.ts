/** Controlled targets must be supplied by the host qualification harness. Never
 * scan real private infrastructure as part of ordinary CI. A successful route
 * hook test cannot satisfy any host boundary probe listed here. */
export const HOST_BOUNDARY_PROBES = [
    'hooks-bypassed-css-import-private',
    'hooks-bypassed-image-metadata',
    'hooks-bypassed-font-private',
    'hooks-bypassed-frame-private',
    'hooks-bypassed-navigation-private',
    'hooks-bypassed-xhr-private',
    'hooks-bypassed-websocket-private',
    'direct-tcp-private',
    'direct-udp-private',
    'direct-dns-controlled-resolver',
    'chromium-sandbox-active',
    'renderer-no-worker-secrets',
    'renderer-no-host-mounts',
] as const;
export type HostBoundaryProbe = typeof HOST_BOUNDARY_PROBES[number];
export type HostProbeEvidence = {
    probe: HostBoundaryProbe;
    denied: boolean;
    target: string;
    observedAt: string;
    evidence: string;
};
export function completeHostEvidence(probes: HostProbeEvidence[]): boolean {
    return HOST_BOUNDARY_PROBES.every(probe => probes.some(result => result.probe === probe && result.denied && result.target.length > 0 && Number.isFinite(Date.parse(result.observedAt)) && result.evidence.length > 0));
}
