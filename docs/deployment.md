# Native persistent deployment runbook

The deployment provider and project have not been selected. This runbook defines service behavior and release steps; it does not claim a service has been created or that a firewall is configured. Fill `deploy/service-contract.json` with the approved provider, region, process supervisor, service identifiers, resource limits, secret references, network rules, Auth redirects, and database connection details before deployment.

## Services and process behavior

Run the web process (`npm run web` after `npm run build`) and the Node worker (`npm run worker`) as separate persistent services under the selected host's native process supervisor. Keep at least one worker running while any queue can contain work. The renderer and outbound proxy run as separate secret-free services with private authenticated task transport. The renderer receives no web, database, or session credentials and has no host filesystem mount. Its only outbound route is the enforcing proxy. These are required target properties, not verified capabilities of the current host.

Set resource ceilings, startup ordering, health checks, graceful stop windows, restart backoff, log retention, and deployment rollback in the provider's service manager. The host and exact values are unresolved. Do not scale the worker or renderer to zero while work is pending.

## Release sequence

1. Build using the pinned Node 22 runtime: `npm ci && npm run typecheck && npm run build`.
2. Apply reviewed database migrations with `npm run db:migrate` under the migration owner. The runner defaults to database names ending in `_test`; it refuses other targets unless an operator explicitly passes `--allow-production` to the script. Keep production migrations deferred until the host and release procedure are qualified.
3. Inject only the secret references named in `deploy/service-contract.json` from the selected host's secret manager. Never copy `.env.example` placeholder values into a live service.
4. Configure web, worker, renderer, and proxy as distinct long-running services using their exact service IDs. Keep the worker enabled whenever queued work can exist.
5. Configure Supabase Auth redirect origins and TLS-verified database endpoints from the deployment values. Separate the least-privilege worker login from migration and application access.
6. Complete the renderer host and egress probes in [renderer-host-qualification.md](renderer-host-qualification.md) before enabling arbitrary user URLs.
7. Verify service health, queue visibility, TLS, database connection limits, restart behavior, and the deterministic extractor's controlled-fixture behavior. Capture exact runtime versions and retained evidence.
8. Stop, restart, roll back, and redeploy by the host's exact named service IDs. Record the actual provider commands in the service contract after selection; no provider-specific command is guessed here.

## Image uploads (Supabase Storage)

Logos, portraits and offering images are stored in the private Supabase Storage bucket `knowledge-assets` and are only ever served through the app at `/api/companies/<companyId>/uploads/<id>` after a membership check. No public bucket URL, signed URL or redirect is handed to the browser.

- Migration `0018_knowledge_assets_storage.sql` creates the bucket row (private, 10 MiB limit, PNG/JPEG/GIF/WebP/SVG only), the `storage.objects` row level security policies and the `public.uploads` metadata table. Apply it with `npm run db:migrate` as a role that may write to `storage.buckets` and create policies on `storage.objects` (the Supabase `postgres` role). If the bucket already exists it is forced back to private with these limits.
- The web process uses the signed-in user's own session for every Storage call, so the policies (object name `<kind>/<companyId>/<uuid>.<ext>`; read for members, write and delete for owners and editors of a company that is not archived; no update, no anonymous access) apply to it. **No service-role key is needed or read by the app, and none must be added to the web process environment for uploads.**
- Required web environment is unchanged: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN` (uploads are same-origin writes). Confirm the project-wide Storage upload size limit (Supabase dashboard, Storage settings) is at least 10 MiB; the bucket and the API enforce 10 MiB for logos and 5 MiB for portraits and offering images.
- Request bodies are read with a hard 11 MiB cap before parsing (chunked bodies included); also limit them at the reverse proxy for `/api/companies/*/uploads`. The upload routes are excluded from the Next middleware matcher because Next 15 buffers only the first 10 MiB of a body for middleware; they refresh the session through `verifiedSession()` themselves.
- Orphans: a failed cleanup after a failed metadata insert can leave an object in `knowledge-assets` with no `uploads` row. The app never serves it, but members of that company can still read it directly through the Storage API under the select policy. A metadata delete that fails after the object was removed leaves a row whose object is gone (served as 404). Review the bucket for objects without an `uploads` row during routine maintenance.

## Secrets and recovery

Use server-only secret injection for `DATABASE_URL`, `WORKER_DATABASE_URL`, renderer task authentication, and proxy credentials. The browser may receive only the Supabase URL and publishable key. The renderer gets no application credentials. Do not put secrets in logs, process arguments, deployment manifests, or build artifacts.

The owner must enable managed database backups, document retention and point-in-time recovery, identify the restore operator, and record a successful restore rehearsal. No provider backup configuration or restore has been verified.

## Current qualification

No provider, host, persistent supervisor, secret manager, renderer service, enforced proxy, Auth project, database pool limits, or backup policy is configured in this work. Deployment and live runtime behavior remain **NOT_PROVEN**.
