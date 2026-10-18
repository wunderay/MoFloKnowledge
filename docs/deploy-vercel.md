# Deploy on Vercel Hobby with Supabase Free

The smallest hosted setup: the web app and a one-shot crawl worker both run as Vercel functions, and Supabase provides Auth, Postgres and Storage. There is no always-on process. For a dedicated worker VM use [deployment.md](deployment.md) instead.

Check the current terms and limits of both plans before you rely on this. Vercel Hobby is for non-commercial use only, and plan limits change. Move to a paid plan for commercial use.

## How the crawl runs

- Creating a company, or starting a scrape, queues a job and then calls `/api/worker/run` once the response has been sent.
- `/api/worker/run` claims one job and works on it for up to 240 s (Vercel Hobby functions stop at 300 s). If the job is not done, its lease is released and the route calls itself again. The next run resumes from the saved checkpoint, so a large site simply takes several runs.
- A daily Vercel cron (`vercel.json`) calls the same route to pick up anything stuck, for example after a failed deploy or a crashed run. Hobby cron can run at most once a day, so the daily call is only a safety net.
- The route answers only to `Authorization: Bearer <CRON_SECRET>`. Without `CRON_SECRET` it always answers 401. Vercel adds the header to cron calls by itself when `CRON_SECRET` is set.
- Pages that need a headless browser are not rendered (there is no renderer); those pages are skipped and the fields stay unknown for human review.

## 1. Supabase

1. Create a project (Free plan). Note the project reference and the database password.
2. Authentication, URL configuration: set the Site URL to your Vercel production URL and add it, with `/**`, to the redirect URLs.
3. Storage: logos and portraits use the private `knowledge-assets` bucket created by migration `0018`, which limits files to 10 MiB. Confirm the project-wide upload limit under Storage settings is at least 10 MiB.
4. Connection strings (Connect button): copy the **pooler** string (Supavisor, session or transaction mode) for the worker. The direct host may be IPv6-only, which Vercel functions may not reach. The app's worker queries use no named prepared statements, so transaction mode works.

## 2. Migrate

Run once from your machine, and again after every upgrade that adds a migration. Connect as the `postgres` user, with the session-mode pooler connection string (or the direct one if your network has IPv6):

```sh
DATABASE_URL="$SUPABASE_POSTGRES_URL" npm run db:migrate -- --allow-production
```

## 3. Worker login

The worker never uses the `postgres` user or a service-role key. Create a login that is only a member of `moflo_worker` (the role the migrations create), in the Supabase SQL editor:

```sql
create role moflo_worker_login login password '<long random password>';
grant moflo_worker to moflo_worker_login;
```

Through the pooler the user name becomes `moflo_worker_login.<ref>`. That string, with the pooler host, is `WORKER_DATABASE_URL`.

## 4. Vercel

Import the repository (framework: Next.js) and set these environment variables for Production:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `APP_ORIGIN` | The production origin, for example `https://your-app.vercel.app` |
| `WORKER_DATABASE_URL` | The worker login's pooler connection string (step 3) |
| `CRON_SECRET` | A random string of at least 32 characters, for example `openssl rand -hex 32` |

`WORKER_DATABASE_URL` and `CRON_SECRET` are read only by `/api/worker/run` (and `CRON_SECRET` by the call that starts it). Never expose them with a `NEXT_PUBLIC_` prefix. Do not set a service-role key.

Optional crawl agent (off by default): set `CRAWL_AGENT_ENABLED=true` together with `CRAWL_AGENT_API_KEY`, `CRAWL_AGENT_MODEL`, `CRAWL_AGENT_BASE_URL` (an OpenAI-compatible endpoint, for example `https://openrouter.ai/api/v1`) and `CRAWL_AGENT_PROMPT` (a file name inside `prompts/`, which ships empty and is included in the worker route's bundle). The agent only chooses which pages to visit next; it never writes facts. With any setting missing the crawl logs one error and runs in its normal order. See [how the crawler works](crawler.md).

Deploy. The cron appears under Project, Settings, Cron Jobs.

## Limits

- Hobby is non-commercial; functions stop at 300 s (the worker stops itself at 240 s and resumes); cron runs at most daily.
- A paused run does not count as a failed attempt for the first 15 minutes after the job started; after that every run counts, so a job that keeps pausing ends at the 3-attempt cap.
- The call that starts a run does not wait for it (it gives up after 10 s). On a preview deploy, verify that a kicked run completes after its caller disconnects.
- Each crawl run uses function time on your plan. Keep the page limit modest on the free plans.
- No renderer or outbound proxy is deployed, so JavaScript-only pages are not captured.
- Supabase Free projects pause after a period of inactivity and have small database and storage quotas; check the current plan terms.
