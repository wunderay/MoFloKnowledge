# Deploy the crawler on an Oracle Cloud Always Free VM

A low-cost setup: Supabase Free provides Auth, Postgres and Storage, the website runs on Vercel Hobby (or on the same VM), and the crawler runs as an always-on `npm run worker` process on an Oracle Cloud Always Free VM.

The automated route (GitHub Actions deploys the website and the worker) is described in [the deploy checklist](deploy.md); this page explains the VM side in more detail and the manual steps behind it.

Check the current terms and limits of every plan before you rely on this. Always Free limits change, and Oracle can reclaim idle Always Free instances. Vercel Hobby is for non-commercial use only.

## 1. Supabase

1. Create a project and note the Auth URL settings for your website origin.
2. Apply the migrations as the `postgres` user with the direct or session-pooler connection string: `DATABASE_URL=... node scripts/migrate.mjs --allow-production`.
3. Create the worker login and make it a member of `moflo_worker` (see [database operations](database-operations.md)). Use its connection string as `WORKER_DATABASE_URL`. Never give the worker a service-role key.

## 2. Website

Deploy the Next.js app on Vercel Hobby, or run `npm run web` on the same VM. It needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN`. It never reads `WORKER_DATABASE_URL`. A new company queues its first crawl; the worker picks it up.

## 3. The VM

Create an Ampere A1 or AMD micro instance (Ubuntu). Only outbound access is needed for the worker; open inbound ports only for SSH (and the website, if you host it here).

Run [`deploy/worker/bootstrap.sh`](../deploy/worker/bootstrap.sh) as root (or paste it as cloud-init user data). It is safe to repeat. It creates the `moflo` user, installs a pinned Node 22 and git, clones the repository to `/opt/moflo` and installs and enables the systemd unit.

```sh
sudo REPO_URL=https://github.com/<account>/<repo>.git bash deploy/worker/bootstrap.sh
```

The worker settings live in `/etc/moflo/worker.env`, owned by root with mode 0600. The deploy workflow writes it on the first deploy; to write it by hand:

```sh
WORKER_DATABASE_URL=postgresql://worker_login.<project-ref>:...@<supabase-pooler-host>:5432/postgres
WORKER_ID=oracle-1
NODE_EXTRA_CA_CERTS=/opt/moflo/deploy/supabase-ca.crt
# Optional: hard limit for one job in milliseconds (default 600000 = 10 minutes, clamped to 1-30 minutes).
# WORKER_JOB_TIMEOUT_MS=600000
```

A job that runs past the limit is stopped and recorded as failed with code `timeout` ("The crawl took too long and was stopped."); it is not retried.

## 4. systemd

The unit is [`deploy/worker/moflo-worker.service`](../deploy/worker/moflo-worker.service): it runs `npm run worker` as the `moflo` user from `/opt/moflo`, restarts on failure, caps memory at 2 GB and CPU at two cores, and is sandboxed (`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `ProtectHome`). Bootstrap installs and enables it; every deploy reinstalls it from the checked-out commit.

```sh
sudo systemctl restart moflo-worker
journalctl -u moflo-worker -f
```

## 5. Health and updates

`npm run worker:health` prints queue age, expired leases and recent failures; it needs `MOFLO_OPS_DATABASE_URL` (a read-only operations login).

The deploy workflow updates the worker. To do it by hand, run `deploy/worker/remote-deploy.sh <full commit sha>` on the VM as a user with sudo. Apply any new migrations first.
