# MoFloKnowledge

## What MoFloKnowledge does

MoFloKnowledge turns a public company website into a source-backed knowledge base. Give it a company's website address and a worker crawls a small, bounded set of that site's pages, saves what it captured, and extracts supported facts with fixed rules. Every extracted value keeps the exact passage or observation it came from. People then review and edit the facts, resolve conflicts, and publish immutable, cited snapshots. Fields the extractor cannot establish stay unknown for a person to fill in.

It is a Next.js 15 web app with a persistent Node.js worker, PostgreSQL with Supabase Auth, an optional isolated Chromium renderer, and a restricted database login for the worker.

## How to set it up and run it

Docker is the only prerequisite ([Docker Desktop](https://docs.docker.com/get-started/get-docker/), or Docker Engine on Linux, with Docker Compose v2.17 or newer).

```sh
./start.sh                 # macOS / Linux
start.cmd                  # Windows
npm run local              # any OS, if you have Node.js
docker compose up --build  # plain Docker; read the demo login from the log
```

The scripts build and start the app, wait until it is healthy, print the demo login (`Open http://localhost:8080 - log in as demo@local.test / <password>`) and open the browser. If Docker Desktop is installed but not running, they start it for you. The first start builds the image and takes a few minutes; later starts take seconds.

- **Port:** 8080. If it is busy, the scripts use the next free port up to 8099, say which, and remember it for the next run. To choose the port yourself, set `MOFLO_PORT` (for example `MOFLO_PORT=9090 docker compose up --build`); this needs no rebuild.
- **Stop:** `./start.sh --stop`, `start.cmd --stop`, `npm run local -- --stop` or `docker compose down`. Your data is kept in the `moflo-data` Docker volume.
- **Start fresh:** the same wrappers with `--reset`, or `docker compose down --volumes`, delete the data.
- A crawl needs outbound internet access from Docker. If Safari will not keep you signed in on `http://localhost`, use Chrome or Firefox.

One container runs PostgreSQL, Supabase Auth, PostgREST, the web app and the worker behind one address; see [`deploy/local`](deploy/local). The local stack is for trying the app on your own machine, not for production.

**Manual setup and deployment.** For your own Node.js (22.23.3), PostgreSQL and Supabase Auth, see [database operations](docs/database-operations.md) and copy `.env.example` to `.env.local`. To go live with Supabase, Vercel and an always-on crawler VM, follow the [deploy checklist](docs/deploy.md) and [Deploy the crawler on Oracle Cloud](docs/deploy-oracle.md). Worker details are in [`src/worker/README.md`](src/worker/README.md) and [runtime support](docs/runtime-support.md).

## Key features

- **Crawl a company site.** Creating a company with a website queues a crawl automatically; a member can also start one and pick a page and depth limit. A progress panel shows the stage and counts, and the knowledge view shows a loading skeleton while a crawl is still filling it in. Progress is checkpointed, so an interrupted crawl resumes.
- **Source-backed values.** Each value links to its exact source excerpt, source page and origin (source-backed, user-provided, and so on). Cards in the knowledge view open an evidence control.
- **Review and edit.** Edit any field by hand; every save is a new revision with history and revert. Key people and offerings can be added, archived and restored. Values you enter are marked as user corrections.
- **Re-scrape proposals and conflicts.** A new crawl produces a proposal. You apply only the fields you select, and where sources disagree you choose which candidate to keep.
- **Snapshots and publishing.** Publishing saves an immutable, numbered, hashed snapshot of the approved entries. It never publishes a public website.
- **Knowledge viewer and export.** View the current draft or any saved version as profile, cards, table, detail or JSON, then export JSON, Word (.docx) or PDF. Exporting never approves or changes anything. See [document export](docs/interface-design.md#document-export).
- **Roles.** Each company has `owner`, `editor` and `viewer` members; access is enforced in the database.
- **Site knowledge.** Captured pages can be imported into a sitemap / internal links section.

## Scraping and data extraction approach

The full rules, including every supported source, are in [How the crawler works](docs/crawler.md). In short:

**Polite, bounded crawling**
- Requests identify themselves as `MoFloKnowledgeBot/1.0`. Crawls start only from a member's action.
- `robots.txt` is fetched once per site and obeyed, including redirects that stay on the same site (apex and `www.`). If it cannot be read, or access is denied, the site's pages are treated as blocked. `Crawl-delay` is honoured as the gap between requests (capped at 60 seconds), with at most 3 page fetches in flight and at least 0.5 seconds between requests to one host.
- Budgets: 15 pages and depth 2 by default (up to 25 pages and depth 3), at most 200 discovered links, 15 seconds per fetch, 2 MiB per page and 5 minutes per crawl. When a limit is hit the crawl records which one and is labelled partial. All are tunable with the `CRAWL_*` variables listed in `docs/crawler.md` and `.env.example`.

**Choosing pages**
- Only same-site pages at or below the starting path are followed. Shallower pages come first; within a depth, links are scored by path and label: about, team and leadership pages and services, products and pricing pages first, then contact, FAQ and booking pages, and unknown pages linked from the main navigation menu.
- Only the first two pages of each funnel kind (quote, contact, financing, testimonials, booking) keep their score. Blog and news pages are demoted, and careers, privacy, terms and login pages are demoted further.
- Up to three linked stylesheets per page (6 per crawl, or 1 when the site declares a `Crawl-delay`) are read for fonts and colours, including CSS custom properties. They do not count against the page limit.

**Safe transport**
- Only `http`/`https` on ports 80 and 443 with a real public hostname. The hostname is resolved first and the connection is pinned to the address that was checked, so private, loopback and link-local addresses are refused (SSRF protection).

**Extraction**
- Structured data is read first: JSON-LD, microdata and meta tags, then visible headings, lists, links, forms and labelled lines.
- Deterministic, generic rules map explicit evidence to registered fields. There is no site-specific or industry-specific logic. A candidate is kept only if it cites captured text or an observation, and a validation step then checks it (for example, a founding year needs an explicit "founded" or "established" statement, not a copyright date).
- Facts are never guessed from nearby wording. Conflicting candidates are surfaced for a person to resolve, and anything not established stays unknown for human review.

## Knowledge base schema design

A knowledge base has seven kinds of entry. Five are singletons per company; people and offerings are repeatable. An optional `site_links` entry holds the sitemap.

| Kind | Main fields |
| --- | --- |
| `company_foundation` | overview, website, industry, business model, year founded, legal entity type, employee count, main address, service locations, alternative names |
| `positioning` | company pitch, founding story |
| `market_and_customers` | target buyers, customer needs, personas, industry groupings, channels, funnels, calls to action, suppliers and partners |
| `branding_and_style` | fonts, brand colours, logos, style descriptions |
| `online_presence` | social media links, phone |
| `key_person` (repeatable) | name, title, role, background, and optional age, nationality, portrait |
| `offering` (repeatable) | name, description, type, category, features, pricing, url, images |

Unknown scalar values are `null` and empty collections are `[]`; defaults never invent facts. The field list is `src/contracts/field-registry.json`.

The database (`supabase/migrations/`) has these tables:

| Table | Purpose |
| --- | --- |
| `companies` | One row per company: name, website, archive flag, draft generation, next snapshot number |
| `company_members` | Membership with role `owner`, `editor` or `viewer` |
| `scrape_jobs` | Crawl jobs: status, options, progress, checkpoint, proposals, errors, lease and attempt count |
| `source_pages` | One row per captured page: URLs, status (`captured`, `blocked`, `failed`, `unsupported`), method (`http` or `browser`), cleaned content, SHA-256, and the technical `observations` and `design_evidence` |
| `knowledge_entries` | One row per entry, with its kind, current revision and an archive tombstone |
| `knowledge_entry_versions` | Append-only revisions: `content`, `provenance`, `review_status` (`unreviewed`, `approved`, `rejected`), author and change reason |
| `knowledge_base_versions` | Immutable published snapshots: entry manifest, full payload and its SHA-256 |
| `uploads` | Metadata for uploaded portraits and offering images |

Observations are stored on `source_pages`. Provenance lives with each revision as sources, exact-quote or technical evidence, and per-value claims that record origin (`source_backed`, `inferred`, `generated`, `user_provided`) and an assessment (`found`, `not_found`, `not_checked`, `partial`, `conflict`).

**Why this design.** Every value points to evidence, so a reader can check any claim against the page it came from. Revisions are append-only, so edits and reverts keep history. Snapshots are immutable and hashed, so a published version is reproducible and exports are exact. Writes go through protected database functions that enforce membership and validate provenance.

## Example prompts for AI enrichment

Extraction itself is deterministic and uses no AI model. The only model-assisted step is an optional, off-by-default **crawl agent** that orders the links the crawl visits next. It never reads pages for extraction and never writes facts, captures or provenance.

Enable it with `CRAWL_AGENT_ENABLED=true` plus `CRAWL_AGENT_API_KEY`, `CRAWL_AGENT_MODEL`, `CRAWL_AGENT_BASE_URL` (an https chat-completions endpoint) and `CRAWL_AGENT_PROMPT`, the name of a file in `prompts/`. The repository ships no prompt: `prompts/` is empty, so you supply the file. If the settings are incomplete or a request fails or times out (10 seconds), the crawl logs one error and continues in its normal order.

The worker sends one chat-completions request per captured page (`src/worker/agent/client.ts`), with temperature 0:

- **system message:** the contents of your prompt file.
- **user message:** JSON, `{"page": "<url>", "remainingPages": <n>, "links": [{"url": "...", "label": "...", "nav": true}]}`.
- **expected reply:** a JSON array of URLs, or `{"links": [...]}`, best first. Only URLs that were offered are used, and each still passes the same scope, depth, page-limit, robots and network rules.

Example prompts to put in `prompts/` (examples, not shipped with the app):

```text
You choose which links a crawler should visit next on a company website. You receive JSON with the
current page, the number of pages still allowed, and candidate links. Reply with only a JSON array of
link URLs, best first. Prefer pages that describe the company, its team, its services or products, and
how to contact it. Skip careers, legal, login and blog pages. Return only URLs from the input.
```

```text
Reply with a JSON object {"links": [...]} listing at most remainingPages URLs from the input. Rank
pages that state what the company sells and who it serves above everything else, then pages about
people and company history.
```

```text
Pick the links most likely to hold a price list, service descriptions or opening hours. Reply with a
JSON array of URLs taken from the input, most useful first. If none apply, reply with [].
```

## Assumptions and limitations

- **Public, same-site pages only.** The crawler never logs in, submits forms or leaves the company's site and starting path.
- **Blocked sites are reported, not bypassed.** Pages that `robots.txt` disallows, or sites whose `robots.txt` cannot be read, are recorded as blocked. A page that answers with an error (for example HTTP 403) is recorded as failed. The crawler does not retry around either. It honours `Retry-After` on a 429 reply for a few seconds and retries once.
- **JavaScript-only sites.** Content that only appears after scripts run needs the Chromium renderer. It is not configured in the local stack, so such pages are recorded as `render_not_configured`, coverage is reported as partial, and a site may yield little or nothing. Rendering arbitrary URLs also requires a qualified host ([renderer host qualification](docs/renderer-host-qualification.md)).
- **Crawl-delay sites are slow.** A large `Crawl-delay` grows the time budget to `Crawl-delay` × documents + 60 s, never past the job timeout minus 60 s, so a crawl can take minutes and may end partial.
- **Page budget.** Only the pages that fit the limits are captured (15 by default), so facts on later pages are missed. Raising the limit costs time and storage.
- **Rule-based extraction.** Facts shown only in images, PDFs, scripts or generated prose may be missed. Fields without a rule, such as gender, stay unknown until a person fills them in. Narrative fields are copied wording, not summaries.
- **Local stack is not production.** It uses generated secrets in a single container and requires outbound internet from Docker. Hosted Supabase and production deployment are manual setup and release steps.
