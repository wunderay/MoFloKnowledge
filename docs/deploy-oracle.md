# Deploy the crawler on an Oracle Cloud Always Free VM

A low-cost setup: Supabase Free provides Auth, Postgres and Storage, the website runs on Vercel Hobby (or on the same VM), and the crawler runs as an always-on `npm run worker` process on an Oracle Cloud Always Free VM.

Check the current terms and limits of every plan before you rely on this. Always Free limits change, and Oracle can reclaim idle Always Free instances. Vercel Hobby is for non-commercial use only.

## 1. Supabase

1. Create a project and note the Auth URL settings for your website origin.
2. Apply the migrations as the `postgres` user with the direct or session-pooler connection string: `DATABASE_URL=... node scripts/migrate.mjs --allow-production`.
3. Create the worker login and make it a member of `moflo_worker` (see [database operations](database-operations.md)). Use its connection string as `WORKER_DATABASE_URL`. Never give the worker a service-role key.

## 2. Website

Deploy the Next.js app on Vercel Hobby, or run `npm run web` on the same VM. It needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN`. It never reads `WORKER_DATABASE_URL`. A new company queues its first crawl; the worker picks it up.

## 3. The VM

Create an Ampere A1 instance (Ubuntu). Only outbound access is needed for the worker; open inbound ports only for SSH (and the website, if you host it here).

```sh
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
# Only if the renderer is used:
sudo apt-get install -y chromium-browser

sudo useradd --system --create-home --home-dir /opt/moflo --shell /usr/sbin/nologin moflo
sudo -u moflo git clone <your-repo-url> /opt/moflo/app
cd /opt/moflo/app && sudo -u moflo npm ci
```

Create `/etc/moflo-worker.env`, owned by root with mode 0600:

```sh
WORKER_DATABASE_URL=postgresql://worker_user:...@<supabase-pooler-host>:5432/postgres
WORKER_ID=oracle-1
# Optional: hard limit for one job in milliseconds (default 600000 = 10 minutes, clamped to 1-30 minutes).
# WORKER_JOB_TIMEOUT_MS=600000
```

A job that runs past the limit is stopped and recorded as failed with code `timeout` ("The crawl took too long and was stopped."); it is not retried.

## 4. systemd

`/etc/systemd/system/moflo-worker.service`:

```ini
[Unit]
Description=MoFlo crawl worker
After=network-online.target
Wants=network-online.target

[Service]
User=moflo
WorkingDirectory=/opt/moflo/app
EnvironmentFile=/etc/moflo-worker.env
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
MemoryMax=2G
CPUQuota=200%
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now moflo-worker
journalctl -u moflo-worker -f
```

## 5. Health and updates

`npm run worker:health` prints queue age, expired leases and recent failures; it needs `MOFLO_OPS_DATABASE_URL` (a read-only operations login).

To update: `sudo -u moflo git -C /opt/moflo/app pull && sudo -u moflo npm --prefix /opt/moflo/app ci && sudo systemctl restart moflo-worker`. Apply any new migrations first.
