# Renderer and destination boundary

The worker uses `fetchDocument` for public HTTP documents and robots. The transport
normalizes WHATWG URLs, classifies every A/AAAA answer, rejects mixed results and
dials one approved address without a second DNS lookup. TLS preserves the original
hostname for SNI and certificate verification. Redirects re-enter the gate (five
maximum). Decoded response bytes and the total request deadline are bounded.

`src/egress/main.ts` provides the authenticated private outbound HTTP/CONNECT
proxy. HTTP only accepts GET/HEAD, strips incoming credentials and remote cookies,
and returns redirects to the browser so each new URL is checked again. The
authenticated `/fetch` control endpoint accepts bounded GET/HEAD tasks, streams
and decompresses HTTP or HTTPS through the pinned transport, and returns only
bounded bytes. Renderer resource hooks use this control channel rather than
buffering browser-driver responses before checking decoded size. CONNECT
only accepts port 443 and pins a public address; encrypted tunnels have byte/time
and connection limits. It does not decrypt TLS. Browser resource/method rules are
additional controls; host egress restrictions remain mandatory.

`src/renderer/main.ts` is a separate process. It clears unapproved environment
variables and launches Chromium with an explicit minimal child environment,
Chromium sandbox enabled, QUIC disabled and an authenticated proxy. Each task
gets a fresh context with service workers, downloads, WebSocket and WebRTC blocked.
Document/frame navigation remains within the validated company scope. Resource
fetching is serialized and bounded, with distinct stylesheet/font/computed/logo
observations; stylesheet access failure remains an explicit limitation.

Before launching Chromium, the renderer requires a host-produced qualification
report named by `RENDERER_BOUNDARY_REPORT`. It must match schema version 1, the
actual non-root renderer UID, valid timestamps, every mandatory confinement flag,
and retained evidence references. This is an operator trust boundary: a hand-written
JSON report does not establish confinement. Follow the deployment qualification
procedure, including hook-bypassed probes and direct TCP/UDP/DNS denial. Protect the
report path from the renderer UID and hostile content. Requalify after topology,
image, firewall, mount or identity changes. No application code can prove that an
operator's supplied report accurately describes the host.

Current development-host status: **NOT_PROVEN** for production sandbox, process/
mount isolation and forced egress. Production arbitrary-URL rendering fails closed
without a qualifying report. The deterministic tests use an explicit fixture-only
transport constructor (no production environment allowlist) and a network-free
Chromium fixture with its sandbox disabled only inside that test. These checks
prove parsing/style capture and request policy behavior, not host confinement.

Run unit/security/renderer tests with the pinned Node 22 toolchain and `npm run
unit -- tests/security tests/worker tests/renderer`. The production renderer has
no fixture-mode environment switch. Resource strings and SVG URLs are metadata;
no executable SVG or HTML is exported or rendered into the application UI.
