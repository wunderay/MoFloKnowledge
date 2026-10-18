# All-in-one local image: PostgreSQL 16 + GoTrue + PostgREST + a small gateway + the Next.js app + the worker.
# Build from the repository root:  docker build -f deploy/local/Dockerfile -t moflo-local .   (docker-compose.yml does this)
# The image holds no secrets: deploy/local/entrypoint.sh generates them on the first start into the data volume.

FROM supabase/gotrue:v2.197.0 AS gotrue
FROM postgrest/postgrest:v12.2.3 AS postgrest
FROM node:22.23.3-bookworm-slim AS node

# ---- build the app. Public values only: the Supabase URL is the single local origin, and the publishable key is a stand-in
# that the entrypoint replaces with the real one on the first start (Next.js inlines NEXT_PUBLIC_* values at build time).
FROM node AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL=http://localhost:8080 \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=moflo-local-publishable-key-placeholder \
    APP_ORIGIN=http://localhost:8080
RUN npm run build && rm -rf .next/cache

# ---- runtime: the Postgres 16 image (Debian bookworm) with Node copied in from the same Debian release
FROM postgres:16.14-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
# GoTrue ships as /usr/local/bin/auth; its migrations are read from GOTRUE_DB_MIGRATIONS_PATH.
COPY --from=gotrue /usr/local/bin/auth /usr/local/bin/gotrue
COPY --from=gotrue /usr/local/etc/auth/migrations /usr/local/etc/auth/migrations
COPY --from=postgrest /bin/postgrest /usr/local/bin/postgrest
COPY --from=build --chown=postgres:postgres /app /app
COPY deploy/local/ /opt/moflo-local/
RUN chmod +x /opt/moflo-local/entrypoint.sh
ENV PUBLIC_PORT=8080
EXPOSE 8080
VOLUME /var/lib/postgresql/data
HEALTHCHECK --interval=5s --timeout=5s --start-period=240s --retries=12 CMD ["node", "/opt/moflo-local/healthcheck.mjs"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["/opt/moflo-local/entrypoint.sh"]
