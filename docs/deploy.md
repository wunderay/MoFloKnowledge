# Deploy checklist

Target setup: Supabase Free (database, Auth, Storage), the website on Vercel Hobby, and the crawler worker on an Oracle Cloud Always Free VM under systemd. Every push to `main` runs [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). The workflow does nothing until the switch in [`deploy/deploy.json`](../deploy/deploy.json) is turned on.

Creating accounts, projects and the VM cannot be automated: each is a one-time console step, and each produces one or more of the keys listed below. After that, going live is one commit.

Check the current terms and limits of each free plan before relying on it. Vercel Hobby is for non-commercial use only, and Oracle can reclaim idle Always Free instances.

## What a deploy does

When `deploy/deploy.json` has `"enabled": true`, a push to `main` (or a manual run from the Actions tab) runs these jobs one after another. A run fails before touching anything if a required secret is missing, and the error lists the missing names.

1. `migrate`: applies new database migrations (`npm run db:migrate -- --allow-production`).
2. `web`: builds the site with the Vercel CLI and deploys it to production.
3. `worker`: copies the environment file and `deploy/worker/remote-deploy.sh` to the VM over SSH. The script checks out the exact commit, runs `npm ci`, and restarts `moflo-worker`. `tsx` runs the worker and is a development dependency, so the full dependency set is installed.

Deploys never overlap. The workflow only deploys from `main` (a manual run from any other branch deploys nothing). To roll back, revert the bad commit on `main`; the revert deploys. Migrations are not reversed.

## One-time setup

### 1. Supabase

1. Create a project (Free plan) and note the database password.
2. Under Authentication, URL Configuration, set the Site URL to your website origin (the `APP_ORIGIN` value below) and add `<origin>/**` to the redirect URLs.
3. Under Project Settings, API, copy the project URL and the publishable key.
4. Under Connect, copy the **Session pooler** connection string (port 5432). The direct connection is IPv6 only, and GitHub-hosted runners have no IPv6. The user looks like `postgres.<project-ref>`. Append `?sslmode=verify-full` to the string. This is `SUPABASE_DB_URL`; it runs migrations as the `postgres` role. Without `sslmode` the Postgres client connects without TLS, and the deploy refuses a string that lacks `sslmode=verify-full`.
5. Create the worker login in the SQL editor. The migrations reuse a `moflo_worker` role that already exists, so creating it first lets the worker be granted it before the first deploy:

   ```sql
   CREATE ROLE moflo_worker NOLOGIN;
   CREATE ROLE worker_login LOGIN PASSWORD 'choose-a-long-random-password';
   GRANT moflo_worker TO worker_login;
   ```

   Build `WORKER_DATABASE_URL` from the same pooler string with the user `worker_login.<project-ref>` and that password, again ending in `?sslmode=verify-full`. See [database operations](database-operations.md). The worker gets no service-role key.

Supabase signs its database certificate with its own root certificate, which Node does not trust by default. The repository carries it as [`deploy/supabase-ca.crt`](../deploy/supabase-ca.crt) and both the migration job and the worker use it through `NODE_EXTRA_CA_CERTS`. If a connection ever fails with a certificate error, download the current certificate from Project Settings, Database, SSL configuration and replace that file.

### 2. Vercel

1. Create a Vercel account on the Hobby plan. Hobby has a single personal scope and no teams.
2. Create the project **without connecting a Git repository** (for example `npx vercel@62.2.0 link` from a checkout, or Add New, Project with an empty import). If a Git repository is connected, Vercel deploys on every push by itself and ignores the switch; disconnect it under Project Settings, Git.
3. In Project Settings, General, set Node.js Version to 22.x.
4. Create an access token (Account Settings, Tokens): `VERCEL_TOKEN`. The org id is the personal account's ID (Account Settings, General, Your ID), and the project id is in the project's Settings, General: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
5. Optionally also add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN` as Production environment variables in the project, so the dashboard matches what the pipeline sets. The pipeline passes its own values either way. Use the final production origin for `APP_ORIGIN` (a custom domain, or `https://<project>.vercel.app`).

### 3. Oracle VM

1. Create an Always Free Ubuntu instance (Ampere A1 or the AMD micro shape). Give it a public IP and add your own SSH public key. Only outbound traffic is needed by the worker; keep the default inbound rule for SSH only.
2. Paste [`deploy/worker/bootstrap.sh`](../deploy/worker/bootstrap.sh) as the cloud-init user data when creating the instance, or SSH in later and run `sudo REPO_URL=<git url> bash bootstrap.sh`. It is safe to run again. It creates the `moflo` user, installs Node 22.23.3 (checksum verified), git, clones the repository to `/opt/moflo` and installs and enables `moflo-worker.service` (the unit file is [`deploy/worker/moflo-worker.service`](../deploy/worker/moflo-worker.service)). It does not start the worker.
3. For a private repository, use an `git@github.com:...` `REPO_URL`. The script prints a read-only deploy key to add under the repository's Settings, Deploy keys, then run it again.
4. Create a dedicated SSH key pair for GitHub Actions (`ssh-keygen -t ed25519 -f oracle_deploy -N ''`), append `oracle_deploy.pub` to `~/.ssh/authorized_keys` of the login user, and keep the private key for `ORACLE_SSH_KEY`. The login user (`ubuntu` on Oracle's Ubuntu images) needs passwordless `sudo`, which those images provide.
5. Record the VM's host key for `ORACLE_SSH_KNOWN_HOSTS`: from a machine you trust, run `ssh-keyscan -t ed25519 <host>` and compare its fingerprint (`ssh-keygen -lf`) with the one shown by `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VM. The line must start with exactly the host name or address used in `ORACLE_SSH_HOST`. The workflow never accepts unknown host keys.

### 4. GitHub secrets

Add these under the repository's Settings, Secrets and variables, Actions, Repository secrets. All are required unless marked optional.

| Secret | Where it comes from |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase, Connect, Session pooler connection string for the `postgres` user, ending in `?sslmode=verify-full` (step 1.4). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Project Settings, API, project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase, Project Settings, API, publishable key. |
| `APP_ORIGIN` | The website's public origin, for example `https://yourdomain.example` (no trailing slash). |
| `VERCEL_TOKEN` | Vercel, Account Settings, Tokens. |
| `VERCEL_ORG_ID` | Vercel Account Settings, General, Your ID (the personal scope). |
| `VERCEL_PROJECT_ID` | Vercel project Settings, General, Project ID. |
| `ORACLE_SSH_HOST` | The VM's public IP address or DNS name. |
| `ORACLE_SSH_USER` | The VM's login user, normally `ubuntu`. |
| `ORACLE_SSH_KEY` | The private key from step 3.4, including the BEGIN and END lines. |
| `ORACLE_SSH_KNOWN_HOSTS` | The host key line from step 3.5. |
| `WORKER_DATABASE_URL` | Session pooler string with the worker login from step 1.5, ending in `?sslmode=verify-full`. |
| `WORKER_ID` | Optional. A name for this worker in job records. Defaults to `oracle-1`. |
| `WORKER_JOB_TIMEOUT_MS` | Optional. Hard limit for one crawl job in milliseconds (default 600000, clamped to 1-30 minutes). |

The worker environment file `/etc/moflo/worker.env` (mode 600, owned by root) is written from the worker secrets on the first deploy. After that it is left alone. To replace it after changing a worker secret, run the workflow manually from the Actions tab with "Replace /etc/moflo/worker.env" ticked.

Do not put these values in the repository, in `.env` files that are committed, or in issues. The repository's secret scanning (`npm run lint`) rejects common key formats.

## Going live

Edit [`deploy/deploy.json`](../deploy/deploy.json) so it reads `{ "enabled": true }` and push that single commit to `main`. The workflow deploys that commit. To switch deployments off again, set it back to `false` in one commit on `main`.

Only `main` can deploy: the switch is treated as off on every other branch, including for manual runs. As optional extra hardening, create a GitHub Environment named `production` limited to the `main` branch and move the secrets into it (the jobs would then also need `environment: production`).

## First checks after the first deploy

- The Actions run is green and the `web` job summary shows the production URL.
- `journalctl -u moflo-worker -f` on the VM shows the worker polling for jobs.
- Sign up on the site, add a company, and watch its first crawl get picked up.

## What is not covered

- The renderer and outbound proxy services (see [renderer host qualification](renderer-host-qualification.md)) are not deployed by this pipeline.
- Database backups and restore rehearsals ([deployment](deployment.md)); Supabase Free has no point-in-time recovery.
- The pipeline does not wait for the CI workflow. Merge to `main` only after CI is green.
- Nothing here has been run against real accounts. The first deploy is the first end-to-end test.
