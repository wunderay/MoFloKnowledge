# Provider and authentication setup gates

No production provider or credential values have been supplied. Do not replace these unresolved items with sample credentials.

## Supabase project and database

Before live integration, the owner must record the project reference, deployed Supabase/PostgreSQL versions, enabled extensions, required roles, and migration owner. Verify TLS requirements, direct versus pooler endpoint behavior, pool mode, connection limits, statement/idle timeouts, and how the web process and worker receive separately scoped credentials. The web client may receive only `NEXT_PUBLIC_SUPABASE_URL` and a publishable key. Service role, database, renderer, and proxy credentials remain server-side.

Configure Auth method(s), allowed redirect URLs, cookie domain/security settings, email verification requirements, and local/test redirect hosts in the selected Supabase project. No live Auth configuration has been tested.

## Deterministic extraction

Product extraction uses deterministic rules over captured source and technical evidence. It requires no AI provider, model selection, model credentials, or external data-processing terms. See [the no-AI product scope](no-ai-redesign.md) for supported evidence and unknown-field behavior.

## Backups and recovery

Record the selected plan's backup frequency, retention, point-in-time recovery availability, restore owner, and a dated restore-test result before release. No backup or restore configuration has been verified.

## Current state

Local package compatibility and deterministic fixture work can proceed. Live Supabase Auth/database behavior, secret injection, and backup readiness remain **NOT_PROVEN** pending owner configuration and evidence.
