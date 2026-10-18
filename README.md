# MoFloKnowledge

MoFloKnowledge turns a public company website into a source-backed knowledge base. Deterministic extraction records supported facts with evidence; people review and edit them, resolve conflicts, and publish immutable, cited snapshots for their company. Fields the extractor cannot establish remain unknown for human review. The app includes scoped membership roles, crawl progress and history, re-scrape proposals, JSON preview, and download. See [the no-AI product scope](docs/no-ai-redesign.md).

In **View knowledge**, choose **Current draft** or a saved version, choose **JSON**, **Word (.docx)**, or **PDF** in the export format selector, then click **Export**. Word and PDF produce a formatted company profile: a centered title, blue section headings, short factual bullets, grouped address/contact details, complete business information, named people and offerings, and meaningful lists. Exact narrative already present in the overview is shown once. Narratives split at clear sentence boundaries. Recognized company statements use fixed neutral fact labels; modalities, conditions and qualifications remain intact. Personal biographies retain their wording under the named person, quotations stay together, and ambiguous grammar remains attributed as saved. Original passages and evidence remain exact in JSON. Customer and industry items use separate bullets; longer single facts remain complete instead of being truncated. Observed colors appear in a horizontal palette with 24-point swatches, hex labels and their original qualifications. Small blue superscript citation numbers link to their matching end references; narrative facts use at most three sources and basic facts use one. All populated business fields are retained, with compact coverage/unknown notes and numbered source references. Viewer filters and collapsed previews do not limit the document. Draft export reads saved revisions; save editor changes first. Exporting does not approve, publish, or change knowledge. Saved-version exports use only that immutable snapshot. JSON contains the complete saved draft DTO or exact canonical saved snapshot, including full claims, exact supporting quotes and technical provenance; the existing saved-version JSON download also remains available. Documents are created on the server without AI, external conversion services, or full captured page bodies. PDFs include an embedded `knowledge.json` attachment with the exact original data; characters unavailable in the bundled font appear as `[U+XXXX]` in PDF text.

PDF rendering bundles official Noto Sans [Regular](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf) (569,208 bytes; SHA-256 `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`) and [Bold](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf) (575,740 bytes; SHA-256 `c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a`) under the [SIL Open Font License](public/fonts/OFL.txt). Next’s output tracing includes both fonts and the license for standalone deployments; rendering never downloads fonts at runtime.

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
DATABASE_URL='postgresql://migration_user:REPLACE_ME@127.0.0.1:5432/moflo_test' npm run db:migrate
```

The migration runner refuses database names without the `_test` suffix unless an operator explicitly passes `--allow-production` to the script. Supabase Auth roles and functions must exist before applying migrations. See [database operations](docs/database-operations.md) for the schema, migration ownership, and role setup.

Run the persistent worker separately with `WORKER_DATABASE_URL` set to a dedicated login that has only the `moflo_worker` grants. Do not use the migration administrator or a service-role credential for the worker. `npm run worker` starts it. The worker uses deterministic evidence extraction; unsupported or inconclusive fields remain unknown and require human review. Renderer use also requires `RENDERER_URL` and `RENDERER_TOKEN`, plus a separately qualified renderer/proxy deployment.

See [worker behavior](src/worker/README.md), [runtime support](docs/runtime-support.md), [provider and Auth setup](docs/provider-setup.md), and [deployment requirements](docs/deployment.md).

## Checks

```sh
npm run lint
npx knip
npm run unit
TEST_DATABASE_URL='postgresql://migration_user:REPLACE_ME@127.0.0.1:5432/moflo_test' npm run db:test
npm run typecheck
npm run build
npm run e2e
```

`npm run lint` runs ESLint and then `secretlint` (raw API keys and tokens; fake fixtures are marked with `secretlint-disable-next-line` comments or listed in `.secretlintignore`). `npm install` also installs a git `pre-commit` hook (simple-git-hooks) that runs secretlint on staged files; it leaves other hooks alone and skips when dependencies are not installed. Bypass it once with `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`.

The database suite creates disposable databases and requires a test migration login able to create/drop them. The browser scenario needs real test Auth users, migrated disposable PostgreSQL, a controlled fixture-only worker, `MOFLO_E2E_OWNER_EMAIL`, `MOFLO_E2E_OWNER_PASSWORD`, `MOFLO_E2E_SECOND_EMAIL`, `MOFLO_E2E_SECOND_PASSWORD`, and `MOFLO_E2E_FIXTURE_URL`; `CHROMIUM_PATH` can select the installed Chromium binary. Missing E2E inputs do not prove acceptance. See [deterministic extraction checks](docs/model-qualification.md). Use [renderer host qualification](docs/renderer-host-qualification.md) before enabling arbitrary URL rendering; application hooks and local fixtures do not prove host confinement.

## Project notes

- Extracted facts are tied to captured evidence and presented for human review; unknowns are not filled by inference.
- Publishing creates an immutable company snapshot; it does not publish a public company website.
- Hosted Supabase and production deployment remain owner-selected setup and release steps.
