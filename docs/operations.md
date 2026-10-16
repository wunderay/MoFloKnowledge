# Operations and queue visibility

The operational summary is a private CLI command. Run it only on an operator host with `MOFLO_OPS_DATABASE_URL`, a restricted read-only database credential approved for aggregate access to `public.scrape_jobs`. It prints counts and timestamps only; it does not include company names, URLs, job IDs, payloads, or error text. Never expose it as a public route.

Run `npm run worker:health` to report the oldest queued age, expired leases, terminal failure rate for the last 24 hours, and the latest persisted job heartbeat. A recent active-job heartbeat shows the worker processed that job. If no heartbeat exists, the result is `unknown`; a healthy idle process cannot be proven from the current schema. The seven-table source plan has no separate worker process heartbeat table, and this command does not add one.

Use the selected host's native process supervisor to inspect, stop, restart, or roll back the exact `web`, `worker`, `renderer`, and `outbound-proxy` service IDs. Provider commands, service names, resource values, and restart policy remain to be entered in `deploy/service-contract.json` after owner selection. Keep at least one worker active while jobs are queued.

Enable managed PostgreSQL backups and point-in-time recovery where available. Record retention, restore owner, and a successful restore rehearsal before release. No backup or restore check has been performed.

All operational credentials stay server-side. The health command requires a read-only operator credential and emits aggregate queue facts only. It does not replace host alerts, database monitoring, or the final provider-specific health policy.
