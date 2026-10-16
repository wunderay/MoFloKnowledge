# MoFloKnowledge

MoFloKnowledge turns a public company website into a source-backed knowledge base. People review and edit extracted company, market, brand, people, and offering facts; resolve conflicts; then publish immutable, cited snapshots for their company. The app includes scoped membership roles, crawl progress and history, re-scrape proposals, JSON preview, and download.

The application is a Next.js 15 web app, a persistent Node.js worker, PostgreSQL/Supabase Auth, an isolated Chromium renderer, and an authenticated outbound proxy. The browser handles review and saves. The worker owns crawl and extraction work; it uses a restricted database login. The renderer has no application secrets and must pass host/network qualification before processing arbitrary URLs.

## Local development

Use Node.js 22.23.3 and npm 10.9.9, install dependencies, and create a private environment file from the example:

```sh
nvm use
npm ci
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN` for a development Auth/PostgreSQL environment. Supabase Auth and its roles/functions must be available before migrations; the repository does not provision an Auth service. The browser gets only the publishable Supabase values. Keep database credentials, model keys, and renderer/proxy tokens in server-only environment configuration. No hosted project or production credentials are supplied by this repository. Standalone migration, test, and worker commands read the shell/host environment; Next.js also reads `.env.local`.

Run the web app with `npm run dev`. For a production build, use `npm run typecheck && npm run build`, then `npm run web`.

## Database and worker

Apply migrations to an explicitly disposable PostgreSQL database first:

```sh
DATABASE_URL='postgresql://migration_user:REPLACE_ME@127.0.0.1:5432/moflo_test' npm run db:migrate
```

The migration runner refuses database names without the `_test` suffix unless an operator explicitly passes `--allow-production` to the script. Supabase Auth roles and functions must exist before applying migrations. See [database operations](docs/database-operations.md) for the schema, migration ownership, and role setup.

Run the persistent worker separately with `WORKER_DATABASE_URL` set to a dedicated login that has only the `moflo_worker` grants. Do not use the migration administrator or a service-role credential for the worker. `npm run worker` starts it. Without `OPENAI_API_KEY` and `OPENAI_EXTRACTION_MODEL`, it retains deterministic observations and reports model extraction as partial; do not treat that as a complete extraction. Renderer use also requires `RENDERER_URL` and `RENDERER_TOKEN`, plus a separately qualified renderer/proxy deployment.

See [worker behavior](src/worker/README.md), [runtime support](docs/runtime-support.md), [provider and Auth setup](docs/provider-setup.md), and [deployment requirements](docs/deployment.md).

## Checks

```sh
npm run unit
TEST_DATABASE_URL='postgresql://migration_user:REPLACE_ME@127.0.0.1:5432/moflo_test' npm run db:test
npm run typecheck
npm run build
npm run e2e
```

The database suite creates disposable databases and requires a test migration login able to create/drop them. The browser scenario needs real test Auth users, migrated disposable PostgreSQL, a controlled fixture-only worker, `MOFLO_E2E_OWNER_EMAIL`, `MOFLO_E2E_OWNER_PASSWORD`, `MOFLO_E2E_SECOND_EMAIL`, `MOFLO_E2E_SECOND_PASSWORD`, and `MOFLO_E2E_FIXTURE_URL`; `CHROMIUM_PATH` can select the installed Chromium binary. Missing E2E inputs do not prove acceptance. Use [model qualification](docs/model-qualification.md) for deterministic fixture checks and the optional bounded live request. Use [renderer host qualification](docs/renderer-host-qualification.md) before enabling arbitrary URL rendering; application hooks and local fixtures do not prove host confinement.

## Project notes

- Facts are tied to captured evidence. Model output is untrusted, validated locally, and presented for human review.
- Publishing creates an immutable company snapshot; it does not publish a public company website.
- Hosted Supabase, model selection, and production deployment remain owner-selected setup and release steps.
