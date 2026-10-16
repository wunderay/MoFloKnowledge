# Renderer host and egress qualification

The production renderer must be a persistent, separate, secret-free process with a private authenticated task channel. It must have Chromium's sandbox enabled, bounded memory/CPU/process/runtime resources, controlled restart behavior, no host filesystem mounts or worker/database secrets, and outbound traffic forced through a validating proxy/firewall. The worker and web process keep their own least-privilege database access. A browser route callback is defense in depth; it does not qualify the host network boundary.

## Required evidence before arbitrary URLs are enabled

Run and retain dated probes against the selected deployment topology proving each item below:

- Private, loopback, link-local, metadata, reserved and mixed public/private DNS destinations are blocked before connection; redirects and DNS changes remain blocked.
- Renderer direct TCP sockets, direct DNS, UDP, QUIC, WebRTC, WebSockets, downloads and browser bypass paths cannot escape the proxy. Cover navigation, iframe, fetch/XHR, CSS imports, fonts, images and redirects.
- The proxy pins approved addresses, preserves Host/TLS verification, revalidates every redirect and connection, and refuses every non-public destination.
- The renderer identity cannot read worker/web secrets or host files, cannot access the database endpoints, and cannot contact unrelated private services. Only the authenticated task endpoint is available on the private channel.
- Chromium sandbox and OS resource/restart limits are active under the exact service identity and image/kernel selected for production.

Record test commands, exact host/image/kernel and service identities, expected and observed results, timestamps, and retained logs/packet traces. Re-run after host, image, proxy, kernel or policy changes. A representative page render proves rendering only.

## Current state

No owner-selected host, private task channel, enforced proxy/firewall, service identity, sandbox deployment or egress probe evidence has been provided. The host boundary is **NOT_PROVEN**. Arbitrary URL execution must remain gated until every required control is independently verified. The example manifest under `deploy/` is explicitly unqualified and is not evidence.
