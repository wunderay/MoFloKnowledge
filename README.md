# MoFloKnowledge

MoFloKnowledge turns a public company website into a source-backed knowledge base. Deterministic extraction records supported facts with evidence; people review and edit them, resolve conflicts, and publish immutable, cited snapshots for their company. Fields the extractor cannot establish remain unknown for human review. The app includes scoped membership roles, crawl progress and history, re-scrape proposals, JSON preview, and download. See [how the crawler works](docs/crawler.md) for the supported sources and extraction rules.

In **View knowledge**, choose **Current draft** or a saved version, pick **JSON**, **Word (.docx)** or **PDF**, then click **Export**. Exporting never approves, publishes or changes knowledge. See [document export](docs/interface-design.md#document-export) for what the documents contain.

The application is a Next.js 15 web app, a persistent Node.js worker, PostgreSQL/Supabase Auth, an isolated Chromium renderer, and an authenticated outbound proxy. The browser handles review and saves. The worker owns crawl and extraction work; it uses a restricted database login. The renderer has no application secrets and must pass host/network qualification before processing arbitrary URLs.

## Local development

Use Node.js 22.23.3 and npm 10.9.9, install dependencies, and create a private environment file from the example:

```sh
nvm use
npm ci
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN` for a development Auth/PostgreSQL environment. Supabase Auth and its roles/functions must be available before migrations; the repository does not provision an Auth service. The browser gets only the publishable Supabase values. Keep database credentials and renderer/proxy tokens in server-only environment configuration. No hosted project or production credentials are supplied by this repository. Standalone migration, test, and worker commands read the shell/host environment; Next.js also reads `.env.local`.

Run the web app with `npm run dev`. For a production build, use `npm run typecheck && npm run build`, then `npm run web`.

## Database and worker

Apply migrations to an explicitly disposable PostgreSQL database first:

```sh
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/moflo_test" npm run db:migrate
```

The migration runner refuses database names without the `_test` suffix unless an operator explicitly passes `--allow-production` to the script. Supabase Auth roles and functions must exist before applying migrations. See [database operations](docs/database-operations.md) for the schema, migration ownership, and role setup.

Run the persistent worker separately with `WORKER_DATABASE_URL` set to a dedicated login that has only the `moflo_worker` grants. Do not use the migration administrator or a service-role credential for the worker. `npm run worker` starts it. The worker uses deterministic evidence extraction; unsupported or inconclusive fields remain unknown and require human review. Renderer use also requires `RENDERER_URL` and `RENDERER_TOKEN`, plus a separately qualified renderer/proxy deployment.

To run the crawler on a free always-on VM, see [Deploy the crawler on Oracle Cloud](docs/deploy-oracle.md).

See [worker behavior](src/worker/README.md), [runtime support](docs/runtime-support.md), [provider and Auth setup](docs/provider-setup.md), and [deployment requirements](docs/deployment.md).

## Checks

```sh
npm run lint
npx knip
npm run unit
TEST_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/moflo_test" npm run db:test
npm run typecheck
npm run build
npm run e2e
```

`npm run lint` runs ESLint and then `secretlint` (raw API keys and tokens; fake fixtures are marked with `secretlint-disable-next-line` comments or listed in `.secretlintignore`). `npm install` also installs a git `pre-commit` hook (simple-git-hooks) that runs secretlint on staged files; it leaves other hooks alone and skips when dependencies are not installed. Bypass it once with `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`.

The database suite creates disposable databases and requires a test migration login able to create/drop them. The browser scenario needs real test Auth users, migrated disposable PostgreSQL, a controlled fixture-only worker, `MOFLO_E2E_OWNER_EMAIL`, `MOFLO_E2E_OWNER_PASSWORD`, `MOFLO_E2E_SECOND_EMAIL`, `MOFLO_E2E_SECOND_PASSWORD`, and `MOFLO_E2E_FIXTURE_URL`; `CHROMIUM_PATH` can select the installed Chromium binary. Missing E2E inputs do not prove acceptance. See [extraction quality](docs/extraction-quality.md) for the extraction spot check. Use [renderer host qualification](docs/renderer-host-qualification.md) before enabling arbitrary URL rendering; application hooks and local fixtures do not prove host confinement.

## Project notes

- Extracted facts are tied to captured evidence and presented for human review; unknowns are not filled by inference.
- Publishing creates an immutable company snapshot; it does not publish a public company website.
- Hosted Supabase and production deployment remain manual setup and release steps.
