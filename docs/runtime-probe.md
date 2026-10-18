# Runtime compatibility probe

`scripts/probe-runtime.mjs` checks the running Node major and launches the configured system Chromium executable through the configured outbound proxy against one controlled sample URL. The browser subprocess receives a small environment allowlist and does not inherit database credentials. The report contains statuses only.

Run with `MOFLO_OWNER_SELECTED_HOST_ID`, `MOFLO_RUNTIME_SAMPLE_URL`, `CHROMIUM_PATH`, and `OUTBOUND_PROXY_URL` set for the selected host. The sample URL must be a controlled fixture reachable through the selected proxy. The command returns exit code 2 with a `NOT_PROVEN` report if required configuration is absent or a sample fails. Do not substitute a public company website or a production URL for the fixture.

Current environment result: **NOT_PROVEN**. No selected host ID, proxy, or renderer task service has been provided. The Node 22 binary and host Chromium are available for local development, but this does not qualify the deployment topology. A successful sample proves only that this runtime can render that fixture. It does not prove isolation, proxy enforcement, blocked private destinations, or release readiness.
