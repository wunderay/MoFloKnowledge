# Runtime and package support record

Checked 2026-10-16 against the upstream release metadata and support policies linked below. Package versions are exact in `package.json` and `package-lock.json`.

| Component | Pin | Evidence and status |
| --- | --- | --- |
| Node.js | 22.23.3 (`.nvmrc`) | Current latest 22.x release listed by [nodejs.org/dist](https://nodejs.org/dist/). The official archive SHA-256 for `node-v22.23.3-linux-x64.tar.xz` is `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`; verified before extracting the local shared toolchain. Node 22 is Maintenance LTS and scheduled through 2027-04-30 per the [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json). |
| npm | 10.9.9 | Bundled with the checksum-verified Node 22.23.3 distribution; `packageManager` records the exact version. |
| Next.js | 15.5.28 | Latest 15.x package version returned by the npm registry on the check date. The [Next.js support policy](https://nextjs.org/support-policy) classifies 15.x as Maintenance LTS (entered that phase 2024-10-21) and says this phase receives critical bug fixes and essential security updates. This remains within the two-year maintenance period. The package declares Node `^18.18.0 || ^19.8.0 || >=20.0.0`; the project pins Node 22.23.3. |
| React / React DOM | 19.3.0 | Next.js 15.5.28 peer range accepts React 19.0 and React 18.2. Exact React versions are pinned together. |
| TypeScript | 5.9.3 | Exact compiler pin, used by Next.js type checking. |
| Tailwind CSS | 4.3.3 | Exact v4 pin with `@tailwindcss/postcss` 4.3.3 and PostCSS 8.5.30 pinned. |
| Supabase | `@supabase/ssr` 0.12.7; `@supabase/supabase-js` 2.118.0 | Exact registry versions. Project URL and publishable key are the only browser-exposed configuration. |
| Validation and extraction | Zod 3.25.76 | Exact pin for runtime validation. Product extraction uses deterministic rules and has no AI provider dependency. |
| Browser and database | Playwright Core 1.64.1; `@playwright/test` 1.64.1; PostgreSQL client `pg` 8.16.3 | Exact pins. Playwright uses the host Chromium path; dependencies do not download a browser. |

On 2026-10-16, `npm audit --omit=dev` reported zero vulnerabilities in the production dependency graph. This excludes development-only tooling and does not replace a future patch review. Re-run the full audit when dependency pins change and before release.

The Node 22.23.3 binary is provisioned at `/workspace/toolchains/node-v22.23.3` for this shared environment. This local binary is not a deployment-host qualification. The owner-selected deployment host and its supported runtime image remain unresolved; release must confirm that it can run the pinned Node 22 line and retain supported patches.
