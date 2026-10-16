# MoFloKnowledge Implementation Plan

MoFloKnowledge turns a public company website into a source-backed knowledge base that people review, revise, version, and export. Build one Next.js application, one durable Node.js worker, and a Supabase database. Use explicit human approval and immutable snapshots as the boundary between extracted drafts and saved knowledge.

# Product scope and assumptions

## MVP boundary

The MVP supports authentication, multiple companies and memberships, bounded website crawling, all seven extraction categories, field-level evidence, draft editing, approval and rejection, entry history, re-scrape proposals, immutable company snapshots, JSON preview, and download. The application name throughout navigation, page titles, documentation, and configuration is **MoFloKnowledge**.

Use TypeScript, Next.js 15 App Router, React hooks and context, Tailwind CSS, Supabase Auth and PostgreSQL. The target repository is `wunderay/MoFloKnowledge`; its main branch contains only a README at planning time. The module names below are proposed responsibilities. This deliverable is a plan; the SQL and signatures are proposed designs.

Repository conventions are **Conventional Commits**, conventional branch names, and **BEM**. Use commits such as `docs: add implementation plan`, `feat: add company review workflow`, and `fix: preserve evidence on revision`. Use branches such as `docs/implementation-plan`, `feat/company-review`, and `fix/evidence-preservation`. Name component-specific CSS classes `block__element--modifier`, for example `knowledge-editor__field--conflicted` and `citation-popover__excerpt`. Tailwind utilities may compose layout/spacing on those components; custom semantic classes and stylesheet selectors follow BEM. Use hooks/context rather than adding another state framework. This project is executed directly without the Guild.

Exclude billing, chatbots, vector search, scheduled crawling, external company enrichment, independent market research, and concurrent collaborative editing. Custom ordering, PDF scraping, sitemap crawling, and a full brand asset archive are later enhancements. Browser rendering and basic observed branding extraction are essential because the required fields include JavaScript-dependent content, fonts, colors, and logos.

“Save draft” records an explicit entry revision. “Save knowledge base version” publishes an immutable snapshot for the company's members; it does not publish a public website. Snapshot history has no edit or delete action. “Delete entry” creates a rejected revision that excludes the entry from future snapshots. Company deletion in the MVP means owner-only archive; physical deletion is outside the MVP.

## Fixed decisions and verification gates

| Decision | Selected approach |
| --- | --- |
| Hosting | Linux containers with a persistent web process and independent persistent Node worker; managed Supabase for Auth and PostgreSQL. No jobs run after an HTTP response in the web process. |
| Runtime | Node.js 22 LTS and a pinned, patched Next.js 15 release; verify package compatibility and vendor support before implementation. If Next.js 15 is outside the deployment's supported security window, resolve that concrete version decision before launch. |
| Durable work | PostgreSQL `scrape_jobs` is the queue and checkpoint store; no Redis or separate queue table. |
| Extraction | Deterministic DOM/CSS extraction plus OpenAI Responses API Structured Outputs using Zod-derived schemas, followed by local semantic validation. Use a configured model supporting strict structured output; qualify the selected model on the fixture before release. |
| UI state | Server reads for initial pages; a company-scoped React context and `useReducer` for edits, selected category, filters, and polling state. Persist explicit saves in the database. |
| Citation style | APA author–date citations for website evidence, with excerpt and full reference on hover/focus/click. Honest attribution labels for user material and generated suggestions. |
| Access | Owner/editor/viewer membership. Browser receives only publishable Supabase configuration and its own session. |
| Source boundary | Facts come from the submitted company website. Public CDN assets may support rendering/style evidence; social and partner sites are not crawled. |

The selected hosting must support Chromium system dependencies, process restart, a small private renderer network, an enforced outbound proxy, and a worker that does not scale to zero while work is queued. Verify database connection limits, TLS, runtime support, model availability, data processing terms, and backup settings during setup. These checks do not require introducing alternative architectures. Next.js documents Node/container self-hosting and server-only environment variables in its [version 15 self-hosting guide](https://nextjs.org/docs/15/app/guides/self-hosting).

# Architecture and data flow

## Components

| Component | Responsibility |
| --- | --- |
| Next.js pages and components | Dashboard, scrape progress, category editor, evidence popover, proposals, version history and JSON preview. |
| Next.js Route Handlers | Authenticate session, validate input with shared schemas, call company-scoped SQL functions using the user's JWT, return safe errors. Use the Node runtime. |
| Shared contracts | Zod business schemas, evidence and proposal contracts, default objects, stable path resolver, validation and snapshot assembler. No browser imports of secret-bearing modules. |
| Node worker | Claim jobs, coordinate fetch/render/extraction, checkpoint, validate proposals, finalize jobs. It alone calls the extraction API. |
| Isolated renderer | Playwright Chromium with fresh contexts, no user session, no database/model secrets, no host filesystem mounts. Produces bounded visible text and design observations. |
| Outbound proxy | Resolve and validate destinations and connect to the validated IP; enforce destination policy for HTTP fetches and every renderer connection. |
| Supabase | Authentication, tenancy, durable jobs, source records, revisions, and immutable snapshots. |

Keep the renderer in a separate process/container without worker environment secrets. It accepts only authenticated private-network tasks from the worker and has outbound network access only through the proxy. The worker and web process may reach the database and model API through separately restricted application egress. Website JavaScript cannot reach these internal services.

## End-to-end flow

1. A verified session calls atomic `create_company`; the caller becomes its first owner.
2. Owner/editor submits a URL and idempotency key. A protected enqueue function checks membership and inserts a queued job; HTTP returns `202` and its ID.
3. The worker claims a job with a lease, validates its URL and redirect scope, checks robots, then visits prioritized company pages.
4. Each page produces an immutable source record after its capture is finalized. The worker checkpoints frontier, budgets, errors, and completed pages.
5. Deterministic observations and page-by-page model candidates produce validated proposals. The reducer deduplicates evidence, preserves conflicts, and fills every required schema key with values, `null`, or `[]`.
6. On a first import, a protected finalization transaction initializes five singleton entries plus separate person/offering entries as unreviewed. If entries already exist, it stores proposals without overwriting them.
7. The user reviews values with evidence, edits fields, and explicitly saves or saves and approves. Every save/review change creates a revision.
8. The user resolves all current entries to approved or rejected. Snapshot creation locks the company, validates current revisions/evidence, and commits a frozen JSON payload.
9. Preview and download retrieve that exact saved payload by company and version ID. Later edits cannot change it.

## Crawl policy and real progress

Default to 10 unique document URLs, depth 2, three concurrent HTTP page tasks, one rendered page at a time, a 500 ms minimum gap between request starts to a host, 15 seconds per fetch, 25 seconds per render, and a 5 minute overall crawl budget. Honor stricter robots rate guidance. Enforce separate limits of 2 MiB decoded HTML per page, 100,000 cleaned characters per page, and 15 MiB total design resources per job. Configurable admin ceilings are 25 documents and depth 3. Limit candidate discovery to 200 normalized URLs; exceeding a budget makes coverage partial, never silently complete.

Start with the submitted homepage. Score same-host links by URL and visible label: About, Product, Service, Pricing, Contact, FAQ, Team, Location, Brand. Follow highest priority first with breadth/depth constraints. Do not click CTAs or submit forms; record visible paths and destinations. Do not crawl documents off the validated host, even if a link claims to be canonical.

Normalize with the WHATWG URL parser: HTTP/HTTPS only, no credentials, ports 80/443 only, normalize host case/IDNA and default ports, remove fragments, drop known tracking parameters, and sort remaining query parameters. Preserve meaningful query values and trailing slash distinctions until a verified redirect establishes equivalence. Deduplicate by normalized URL and verified redirect alias. Record `rel=canonical` as metadata; never follow it blindly. Reject IP-literal submissions, localhost and single-label hosts.

Permit only the validated bare-domain/`www` pair for company document redirects. Establish the pair from an offline public-suffix calculation, not arbitrary subdomains; require every redirect target and resolved address to pass the network gate. Other hostname redirects stop the job with a scope error. A company hosted on a subdomain remains scoped to that exact hostname; adding `www` to it is not an assumed alias. After a successful initial redirect, use the effective origin as the crawl root and preserve both requested and final URL as evidence.

Fetch `/robots.txt` for each permitted origin through the same network gate, using an identifiable `MoFloKnowledgeBot` user agent. Respect disallow rules; treat 404 as no published rules, 401/403 as blocked, and timeouts/5xx as unavailable: retry once and skip that origin if still indeterminate. Record the limitation. Do not solve CAPTCHAs, reuse logged-in sessions, or bypass paywalls/access controls. Treat 429 using bounded `Retry-After`; do not retry permanent 4xx responses.

Use asynchronous I/O concurrency, not JavaScript CPU threads, for page fetching. A single coordinator atomically reserves the document/depth/byte budgets before dispatch; a semaphore limits work to three pages and one renderer. CPU-heavy HTML parsing can be moved to Node worker threads only after measurement. Start with one active company job per company and one claimed job per worker process; additional processes safely claim different jobs.

Job progress is persisted, for example “Crawling: 6 captured, 1 failed, 2 queued; limit 10,” then “Extracting: 5 of 6 captured pages processed.” Do not invent an overall percentage while discovery changes the denominator. The browser polls every 2 seconds while active, backs off on errors, and stops at terminal status. Query parameters retain `companyId` and `jobId`, allowing refresh to recover state. Persisted saves survive refresh; unsaved edits trigger a navigation warning.

Claim with a short transaction using `FOR UPDATE SKIP LOCKED`, update `lease_token`, `lease_expires_at`, `attempt_count`, and commit before network I/O. Heartbeat every 15 seconds with a 60 second lease. Every checkpoint and finish operation requires the current unexpired token; a restarted or delayed worker cannot finish a superseded attempt. Reclaim expired jobs, resuming successful page captures, for at most three attempts. Use unique source `(company_id, scrape_job_id, normalized_url)` and atomic finalization to prevent duplicate imports. PostgreSQL explicitly identifies [SKIP LOCKED as useful for queue-like consumers](https://www.postgresql.org/docs/current/sql-select.html).

## Capture and extraction

Extract title, author/publisher if stated, publication/update date if stated, main text with heading structure, JSON-LD, meta descriptions, links with visible labels, forms/CTAs without submission, address text, price text, and company-linked social links. Remove scripts, event handlers, hidden boilerplate and executable markup from model input; retain only bounded normalized plain text and a separate structured observation object. Preserve line/segment IDs for verifiable quote matching. Retain meaningful visible punctuation and wording.

Use HTTP HTML first. Render the homepage for required style observations; render other pages only when main text is missing/clearly a script shell or a required content section is client-rendered. Capture final visible text, selected computed styles for headings/body/buttons/backgrounds, relevant CSS declarations, referenced font resources and logo candidates. A CSS declaration proves declaration, not actual font usage. Record CSS-declared, loaded and computed observations independently; a fallback family is never automatically a confirmed brand font. Cross-origin CSSOM access may fail: use bounded captured stylesheet responses, or record unavailable evidence instead of inventing it.

Normalize RGB/HSL colors to six-digit hex when opaque; keep alpha and composite background separately when necessary. Do not label every color “brand.” Rank recurring interface colors and label their apparent roles as interpretations unless a brand guide explicitly establishes them. Identify header/footer company logos using surrounding text, link targets and alt text; distinguish favicon and partner logos. Export asset URLs and observation metadata, not executable SVG contents.

For each captured page, feed the model only sanitized text segments and deterministic observations in an explicitly untrusted data envelope. The model receives no browsing tools, database tools, credentials, or permission to follow embedded instructions. Ask for field candidates, observation type, evidence segment references, and conflicts. Strict Structured Outputs enforces shape, while a local Zod parse plus semantic checks verifies URLs, quote containment, IDs, scope, pricing and origin labels. Structured output alone is not factual validation; handle refusals, incomplete responses, and invalid citations as extraction failures. The official [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs) describes JSON Schema and SDK schema support.

The chosen reducer is deterministic: combine identical normalized candidates and their evidence; preserve differing candidates under one field conflict. Do not silently prefer a more recent crawl, home page, or model confidence score. A user chooses the current candidate, supplies a correction, or rejects the entry. Material conflicts block approval until resolved or the affected value is cleared with its conflict decision preserved in the revision. Same-name people and products are only possible duplicates; do not merge them without a stable matching URL or a reviewer decision. Record model, prompt and schema versions in proposals, keeping them out of plain business values.

## Network and rendering security

Validate DNS A and AAAA answers before connecting; deny any private, loopback, link-local, multicast, unspecified, reserved/non-global, carrier-grade NAT and IPv4-mapped private IPv6 destination. Reject a hostname with mixed public/non-public answers. Pin the connection to an approved address while preserving hostname validation and TLS SNI; revalidate on redirects and new connections to defeat DNS rebinding. Cap redirects at five and handle them manually. Use a maintained IP classification library and test special forms rather than handwritten string-prefix rules.

This gate covers homepage, robots, all crawled links, redirects, CSS imports, fonts, images, metadata URLs, browser navigation, fetch/XHR, iframe, WebSocket and any later asset-preview proxy. Application request interception is defense in depth; an enforced proxy/firewall must deny private/internal destinations even when the browser bypasses an application hook. Block direct UDP/QUIC, direct DNS and direct outbound sockets from the renderer. Disable service workers, downloads, WebRTC and WebSockets; allow only bounded public HTTP(S) GET/HEAD resource loading. Block cross-host frame/document navigation; public CDN CSS/fonts/images may load through the gate. Playwright documents proxy and routing support, and the need to [block service workers when routing requests](https://playwright.dev/docs/network).

Render all values and excerpts as escaped React text. No `dangerouslySetInnerHTML`, remote page embedding, or remote SVG injection. Link targets allow only validated HTTP(S), with `noopener noreferrer`. Do not let an arbitrary saved logo URL reach Next.js image optimization: the MVP shows a link, or a raster preview obtained by the same protected fetch gate. Authentication cookies are Secure/HttpOnly where appropriate; authorize every operation server-side, validate write request origins/CSRF protection, and use private/no-store caching for tenant data.

# Extraction coverage matrix

All fields below are attempted. Every required top-level category field gets a persisted assessment, even when its value is empty. `S` means directly source-backed; `I` means labeled inference is permitted; `G` means a separately labeled generated suggestion is permitted; `U` means a user may supply/correct a value. User changes never acquire a website origin automatically.

Scalar default is `null`; collection default is `[]`. Composite scalars such as address, employee count and pricing are `null` when wholly unavailable; their known nested object fields remain explicitly nullable. Empty collections do not prove that no such thing exists. For any field, `not_found` means not found in successfully processed, bounded relevant material; `not_checked` means no relevant material could be processed; `partial` means relevant material or extraction was skipped/failed/truncated. Existing values can also have partial coverage. `conflict` retains candidates; `found` means usable evidence exists within crawl scope. Review status is independent.

## Company Foundation

| JSON path under `company_foundation` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `overview` | string/null | About/home description and exact excerpt. | S or labeled I summary; U; null if absent. |
| `website` | URL/null | Validated effective primary site and redirect trace/technical observation. | S/U after URL validation; null if validation fails. |
| `industry` | string/null | Preserve company's explicit description and quote. | S, labeled I classification, U; null. |
| `business_model` | string/null | Claims about B2B/B2C, revenue and operating model; quote each assertion. | S, labeled I, U; null. |
| `company_role` | IdentifiedText[] | Manufacturer/distributor/reseller/provider/marketplace statements. | S, labeled I, U; []. |
| `year_founded` | integer/null | Explicit founding statement, not copyright year. | S/U; null. |
| `legal_entity_type` | string/null | Legal/about/footer statement. Never derive from domain or country. | S/U; null. |
| `employee_count` | EmployeeCount/null | Exact/range/raw wording and explicit as-of date. | S/U; null; never manufacture exact count. |
| `main_address` | Address/null | Contact/location primary-address statement and quote. | S/U; null; do not assume first address is headquarters. |
| `other_locations` | Address[] | Named offices/facilities and supporting address text. | S/U; []. |
| `service_locations` | IdentifiedText[] | Explicit service geography, separate from premises. | S/U; []. |
| `alternative_company_names` | IdentifiedText[] | Explicitly associated trading/former/abbreviated names. | S/U; []. |

## Positioning

| JSON path under `positioning` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `company_pitch` | string/null | Existing pitch quote; generated pitch must cite the supporting fact claims. | S, G, U; null. |
| `founding_story` | string/null | Actual origin narrative with excerpt. A founding year is insufficient. | S/U; null. |

## Market and Customers

| JSON path under `market_and_customers` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `target_buyers` | IdentifiedText[] | Audience/buyer statements and excerpts. | S, I, U; []. |
| `customer_needs` | IdentifiedText[] | Problems/goals; explicit claim versus interpretation labeled per item. | S, I, U; []. |
| `ideal_customer_personas` | Persona[] | Source-supported role, organization, goals, pain points; suggestions labeled. | S, G, U; []. |
| `industry_groupings` | IdentifiedText[] | Company's vertical labels or labeled classification. | S, I, U; []. |
| `industry_outlook` | Commentary[] | Website trend commentary with publisher, date if stated and quote. | S/U; []; never independent market research. |
| `channels` | Channel[] | Observed sales/contact/distribution/marketing links and labels. | S, I for apparent purpose, U; []. |
| `funnels` | Funnel[] | Ordered observed steps with links; only visible transitions, no invented internal stages. | S for steps, I for interpretation, U; []. |
| `ctas` | CTA[] | Visible label, resolved destination and apparent purpose. | S for label/URL, I for purpose, U; []. |
| `suppliers_and_partners` | Partner[] | Name and explicit relationship wording. | S/U; []; logo alone permits only “logo displayed,” relationship_type null. |

## Branding and Style

| JSON path under `branding_and_style` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `writing_style_description` | string/null | Tone/formality/vocabulary/sentence patterns grounded in representative excerpts. | I/U; null. |
| `art_style_description` | string/null | Rendered layout/imagery/graphic observations, selectors or snapshot references. | I/U; null. |
| `fonts` | Font[] | CSS declaration, resource load and computed family kept distinct; selector and use. | S observations; I use when interpretive; U; []. |
| `brand_colors` | Color[] | CSS/computed value normalized to hex with selector; label observed versus brand-guide-confirmed. | S values, I apparent roles, U; []. |
| `logos` | Logo[] | Absolute asset URL and header/footer company context; exclude partner/favicons. | S asset identity, I variant if interpretive, U; []. |

## Online Presence

| JSON path under `online_presence` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `social_media_links` | SocialLink[] | Company website's outbound profile anchor; platform and profile URL. | S/U; []; exclude share/intent links. |

## Key People

`key_people` is a collection of `Person`; each person has a permanent UUID.

| JSON path under `key_people/@id` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `name` | string/null | Public team/leadership name. | S/U; null; don't create a wholly empty person. |
| `title` | string/null | Published job title quote. | S/U; null. |
| `role` | string/null | Explicit professional responsibility or relationship. | S/U; null. |
| `gender` | string/null | Only an explicit public self-description; keep source wording. | S or user-supplied explicit self-description; null; never infer from pronouns, name, photo or title. |
| `background_or_relevance` | string/null | Source-backed professional background/relevance. | S, I summary grounded in facts, U; null. |

## Offerings

`offerings` is a collection of `Offering`; each offering has a permanent UUID.

| JSON path under `offerings/@id` | Type | Method and evidence | Allowed origin and missing behavior |
| --- | --- | --- | --- |
| `name` | string/null | Product/service page heading and excerpt. | S/U; null; don't create wholly empty offering. |
| `description` | string/null | Offering-specific description. | S, I summary, U; null. |
| `offering_type` | string/null | Product/service/subscription/package claim or labeled classification. | S/I/U; null. |
| `category` | string/null | Source grouping or labeled useful grouping. | S/I/U; null. |
| `features` | IdentifiedText[] | Features explicitly associated with this offering. | S/U; []. |
| `pricing` | Pricing/null | Preserve raw text, amount/range, currency, interval, model and qualifications. | S/U; null means pricing not found/not checked according to assessment. |
| `url` | URL/null | Relevant observed product/service page. | S/U; null. |

# Screens and user workflows

## Dashboard at `/dashboard`

Show only accessible, unarchived companies with name, website, role, latest job state and latest snapshot number/time. Empty state creates a company; a short form accepts display name and website. A company switcher drives explicit company-scoped navigation. Never rely on context alone for tenancy: every query and write includes a company ID and verifies membership. Owners can archive a company and manage membership by an existing registered user's UUID; invitations/email sending are outside the MVP.

## Scrape and Build at `/knowledge?companyId=...`

The main page contains URL input, validation, Start scrape, persisted progress, and seven category tabs with coverage/review counts. The header identifies the company and current draft generation. One side displays editable values and origin badges; the other displays exact excerpts, source page title/URL, retrieval time and technical evidence. On smaller screens open evidence in a drawer.

States: no crawl, queued, validating, crawling, extracting, partial results, ready to review, failed, cancelled, unsaved edits, saving, stale edit, unresolved conflict, approved, rejected, and published version saved. Disable scraping and mutations for viewers while keeping evidence/history/export available. A partial crawl remains reviewable; show skipped/blocked/failed URLs and allow a fresh scrape. Empty values show “Not found in checked pages” or “Could not check,” based on assessment.

Each entry has Save draft, Save and approve, Approve unchanged, Reject, and History. Changes to approved content default to unreviewed. A category singleton is the approval unit; individual fields keep their own evidence and origin. Required keys with unknown values do not prevent approving the section. A singleton section can be rejected; export still includes its empty schema defaults. People and offerings are separately approved/rejected entries. Clear a field or choose a conflict candidate and record the review decision before approval. “Approve all” may act on already inspected eligible entries in one transaction, but is not a prerequisite.

A Re-scrape proposals panel shows current versus proposed value, both evidence sets, and “Apply selected changes to draft” or “Dismiss proposal.” Applying checks the entry's expected revision and creates a new unreviewed revision. Dismissal changes only that job's proposal decision metadata; it does not remove the source record or proposal content. An old proposal's conflict is evaluated against the current revision before applying; no automatic merge engine.

Save knowledge base version shows approved/rejected counts, unresolved entries and an exact preview assembled on the server. Final save submits the expected company draft generation; if anything changed since preview, return 409 and require an updated preview. At least one approved entry is required. Saving starts a database transaction and returns the stored version ID; it does not merely serialize browser state.

## View and Manage at `/knowledge/view?companyId=...`

Show a company/version selector and three modes over the same data: category cards, compact table of entries, and full detail with evidence. Search within the current company's values and filter by section, origin, review status and coverage. For the bounded MVP dataset, search/filter in memory after a company-scoped read; no global search index is necessary. The default is latest snapshot if one exists, with a clearly labeled draft view. Snapshot mode is read-only. Edit opens the current draft entry; Remove creates a rejected revision. History can restore prior content into a new revision. Download any snapshot by its saved ID.

## APA evidence interaction

For website material, show `(Organization, n.d.)` or `(Named author, Year)` using only observed metadata. Distinguish same-author/same-year sources as `n.d.-a`, `n.d.-b` or year letters in deterministic source order. Full reference: `Author. (Date or n.d.). Page title. Site name if different from author. URL.` Show retrieval timestamp as provenance metadata; include an APA retrieval-date phrase when the page is designed to change over time. Do not substitute crawl time for publication date or invent an author. If no author is available, APA uses the page title in the author position.

Every displayed factual leaf has a citation button linked to its claim. Hovering/focusing opens an interactive popover containing the exact original text or labeled technical evidence plus full APA reference and source link. Keep it open while pointer/focus is in either trigger or popover; close after both are left, on Escape, or outside click. Support tap, keyboard focus, and accessible relationships. A summary row may collapse repeated citation buttons, but opening it exposes citations for each nested value.

Generated values show “Generated suggestion — approved” and APA citations to their supporting facts; the tooltip explicitly states that the proposed wording is not a source quote. User corrections show “User-provided correction,” author and save time, with any prior source claim labeled as superseded rather than supporting the changed fact. Do not fabricate a public website citation for private user input. Unknown values show their coverage explanation, not a spurious citation. This preserves the intent of citations accompanying every piece of data without misrepresenting generated or user-authored content.

# Supabase schema and relationships

## Entry granularity and common rules

Keep exactly the seven baseline tables. Five singleton entry kinds map to `company_foundation`, `positioning`, `market_and_customers`, `branding_and_style`, and `online_presence`. Each person and offering is its own `key_person` or `offering` entry. Repeatable values inside a singleton, including locations, channels and colors, also have stable UUIDs. A required field missing from an approved singleton is still present with its default. Rejected/uncreated sections assemble from schema defaults.

All UUID primary keys default to `gen_random_uuid()`. Times are `timestamptz`; all non-null timestamp defaults below are `now()`. The SQL explicitly defines nullability, defaults, checks, keys, relationships and indexes. An omitted `DEFAULT` means the application/function must supply the value, or SQL uses null when the column is nullable. All foreign keys use `ON UPDATE NO ACTION` by PostgreSQL default; all deletion behavior is explicitly `RESTRICT`. Preserve identities and historical authors by deactivating accounts rather than deleting referenced Auth users in the MVP. Archive companies; do not cascade-delete historical evidence.

Store URL validity and nested contract validation in shared code plus protected function validation; simple column checks are not substitutes for URL/DNS validation. `private` is a non-exposed schema for helpers and trusted-worker functions. JSON input must be an object where the SQL says object; each operation performs the stricter versioned JSON validation described below.

## Proposed table definitions

```sql
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  website_url text NOT NULL CHECK (website_url ~ '^https?://'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creation_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  draft_generation bigint NOT NULL DEFAULT 0 CHECK (draft_generation >= 0),
  next_snapshot_version bigint NOT NULL DEFAULT 1
    CHECK (next_snapshot_version >= 1),
  UNIQUE (created_by, creation_request_id)
);
CREATE INDEX companies_creator_idx ON public.companies(created_by);
-- Deliberately no global UNIQUE constraint on website_url or hostname.

CREATE TABLE public.company_members (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX company_members_user_idx
  ON public.company_members(user_id, company_id);

CREATE TABLE public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  requested_url text NOT NULL CHECK (requested_url ~ '^https?://'),
  effective_url text NULL CHECK (effective_url IS NULL OR effective_url ~ '^https?://'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued','validating','crawling','extracting','succeeded','partial','failed','cancelled')),
  options jsonb NOT NULL DEFAULT '{"max_pages":10,"max_depth":2}'::jsonb
    CHECK (jsonb_typeof(options) = 'object'),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(progress) = 'object'),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(checkpoint) = 'object'),
  proposals jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(proposals) = 'object'),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(errors) = 'array'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  heartbeat_at timestamptz NULL,
  cancel_requested_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, request_id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((status IN ('succeeded','partial','failed','cancelled'))
    = (finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX scrape_jobs_one_active_idx ON public.scrape_jobs(company_id)
  WHERE status IN ('queued','validating','crawling','extracting');
CREATE INDEX scrape_jobs_claim_idx ON public.scrape_jobs(next_attempt_at, created_at)
  WHERE status IN ('queued','validating','crawling','extracting');
CREATE INDEX scrape_jobs_company_idx ON public.scrape_jobs(company_id, created_at DESC);
CREATE INDEX scrape_jobs_requester_idx ON public.scrape_jobs(requested_by);

CREATE TABLE public.source_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  scrape_job_id uuid NOT NULL,
  normalized_url text NOT NULL CHECK (normalized_url ~ '^https?://'),
  final_url text NULL CHECK (final_url IS NULL OR final_url ~ '^https?://'),
  title text NULL,
  author text NULL,
  site_name text NULL,
  published_on date NULL,
  retrieved_at timestamptz NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  response_status smallint NULL CHECK (response_status BETWEEN 100 AND 599),
  capture_status text NOT NULL CHECK (capture_status IN
    ('captured','blocked','failed','unsupported')),
  capture_method text NULL CHECK (capture_method IN ('http','browser')),
  cleaned_content text NULL,
  content_sha256 text NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  observations jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(observations) = 'object'),
  design_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(design_evidence) = 'object'),
  error_code text NULL,
  UNIQUE (company_id, id),
  UNIQUE (company_id, scrape_job_id, normalized_url),
  FOREIGN KEY (company_id, scrape_job_id)
    REFERENCES public.scrape_jobs(company_id, id) ON DELETE RESTRICT,
  CHECK (capture_status <> 'captured' OR
    (retrieved_at IS NOT NULL AND final_url IS NOT NULL
     AND cleaned_content IS NOT NULL AND content_sha256 IS NOT NULL))
);
CREATE INDEX source_pages_job_idx ON public.source_pages(company_id, scrape_job_id);

CREATE TABLE public.knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN
    ('company_foundation','positioning','market_and_customers',
     'branding_and_style','online_presence','key_person','offering')),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX knowledge_entries_singleton_idx
  ON public.knowledge_entries(company_id, kind)
  WHERE kind NOT IN ('key_person','offering');
CREATE INDEX knowledge_entries_creator_idx ON public.knowledge_entries(created_by);

CREATE TABLE public.knowledge_entry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  entry_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  schema_version text NOT NULL DEFAULT '1.0.0',
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  review_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','approved','rejected')),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  change_reason text NULL CHECK (change_reason IS NULL OR length(change_reason) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entry_id, revision),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, entry_id)
    REFERENCES public.knowledge_entries(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX knowledge_entry_versions_author_idx
  ON public.knowledge_entry_versions(author_id);
ALTER TABLE public.knowledge_entries ADD CONSTRAINT entry_current_revision_fk
  FOREIGN KEY (company_id, id, current_revision)
  REFERENCES public.knowledge_entry_versions(company_id, entry_id, revision)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.knowledge_base_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  version_number bigint NOT NULL CHECK (version_number >= 1),
  schema_version text NOT NULL DEFAULT '1.0.0',
  request_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  entry_manifest jsonb NOT NULL CHECK (jsonb_typeof(entry_manifest) = 'array'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  UNIQUE (company_id, id),
  UNIQUE (company_id, version_number),
  UNIQUE (company_id, request_id),
  CHECK (payload->>'company_id' = company_id::text),
  CHECK (payload->>'knowledge_base_version_id' = id::text),
  CHECK (payload->>'version' = version_number::text),
  CHECK (payload->>'schema_version' = schema_version)
);
CREATE INDEX knowledge_base_versions_author_idx
  ON public.knowledge_base_versions(author_id);
```

The leading company columns in unique indexes serve company-scoped reads; the version-number index supports latest-version lookup. The entry revision unique index supports history and latest-pointer lookup. Foreign-key lookups not covered by leading indexes receive the explicit indexes shown. Add no broad JSON GIN indexes until a demonstrated query needs them.

`progress` stores safe integer counts/stage summaries. `checkpoint` stores normalized pending URLs, depth, page outcomes, consumed budgets and extraction completion IDs. `proposals` stores typed candidates, coverage, conflicts and append-only decision records; decision records can be appended by protected review operations while extracted candidate content remains unchanged. `errors` contains only sanitized code/URL/retryable/message records, never provider credentials or full prompts. `observations` contains redirect trace, parsed metadata, segment IDs, links and CTA observations; `design_evidence` contains bounded selectors, declarations, computed values and asset URLs. The full source content stays internal to the company and is never included in exports.

## Relationships and historical integrity

| Parent | Children and tenant constraint |
| --- | --- |
| `auth.users` | Company creator, members, membership actor, job requester, entry creator, revision/snapshot authors; deletion restricted. |
| `companies` | Memberships, jobs, source pages, entries, entry revisions and snapshots; every child carries a company FK. |
| `scrape_jobs` | Source pages use `(company_id, scrape_job_id)`; a source cannot point to another tenant's job. |
| `knowledge_entries` | Revisions use `(company_id, entry_id)`; current pointer uses company, entry and revision. |
| `source_pages` | JSON evidence references validated by protected functions/triggers, not by pretending JSON IDs are foreign keys. |
| `knowledge_base_versions` | Frozen manifest references approved revisions and source metadata; validation ensures all belong to the same company. |

Before inserting a revision or finalizing proposals, validate every JSON source ID against `source_pages` with the same `company_id`, captured status and recorded evidence. Confirm stored URL/retrieval time matches the source, quotes occur in stored segments, and technical evidence IDs/selectors resolve in captured observations. Validate stable paths against content and prohibit duplicate/unknown item IDs. Before snapshot insertion, validate its entry manifest against that company's immutable approved revisions and derive source metadata from stored records. Implement these as reusable protected SQL validators with triggers on ingestion/revision/snapshot inserts, so application checks cannot be bypassed by another trusted write path. Do not let the browser submit its own frozen source metadata.

Install triggers rejecting UPDATE/DELETE on source pages, entry revisions and snapshots. Finalize a page capture only after optional browser rendering; do not insert an HTTP row then mutate it into browser evidence. Retries reuse finalized rows. Install an entry trigger rejecting changes to company, ID, kind or creator; only its current pointer is mutable through protected functions. Company/member identity columns cannot be reassigned. Updating a singleton, reordering an array, rejecting a person or reverting content never modifies an old revision or deletes its evidence. Snapshot payloads also freeze source titles, URLs, dates, excerpts and company metadata, so old citations do not depend on live tables or the website remaining available.

# Authorization and RLS

## Permissions

| Role | Read | Scrape | Edit and approve | Save snapshots | Export | Membership and archive |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | Yes | Yes | No |
| Viewer | Yes | No | No | No | Yes | No |
| Non-member or signed out | No | No | No | No | No | No |

“Read” includes drafts, history, proposals and source evidence belonging to that company. Archive removes normal UI discovery and blocks writes, but existing members retain read/export of history through the company archive screen. The system does not maintain a public knowledge endpoint.

## Table policies and grants

Enable RLS on all seven tables. Grant `authenticated` SELECT on each table, scoped by membership. Grant only `UPDATE(name)` on companies as the single direct metadata mutation. All other client INSERT/UPDATE/DELETE privileges are revoked; absence of write policies is an additional default-deny barrier. `anon` and PUBLIC have no table access. No browser service-role key is used.

| Table | Authenticated RLS reads | Direct authenticated writes | Authorized write path |
| --- | --- | --- | --- |
| companies | Caller is member of `id`. | Only name: owner/editor, unarchived, USING and WITH CHECK. | Atomic company creation; validated website change; owner archive. |
| company_members | Caller is member of `company_id`. | None. | Owner-only membership function; initial owner from company creation. |
| scrape_jobs | Caller is member. | None. | Owner/editor enqueue/cancel; trusted worker checkpoint/finalize; protected proposal decisions. |
| source_pages | Caller is member. | None. | Trusted worker inserts final captures; never updates/deletes. |
| knowledge_entries | Caller is member. | None. | Protected import/save/apply functions create identities/update current revision. |
| knowledge_entry_versions | Caller is member. | None. | Protected immutable revision inserts. |
| knowledge_base_versions | Caller is member. | None. | Protected publish function inserts a complete validated snapshot. |

Apply the grants and SELECT policies to every table, not just the examples. The helper reads membership under a non-login table-owner role, preventing recursive membership RLS. It returns only the current caller's role and never accepts an arbitrary user ID. `private` is not exposed as a Data API schema. Supabase documents [RLS, grants and service-role bypass](https://supabase.com/docs/guides/database/postgres/row-level-security); table-owner/definer functions are privileged, so their explicit authorization is mandatory.

```sql
-- Proposed representative security definitions, after creating private schema.
DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','company_members','scrape_jobs',
    'source_pages','knowledge_entries','knowledge_entry_versions',
    'knowledge_base_versions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $policies$;

CREATE FUNCTION private.company_role(p_company uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.role FROM public.company_members AS m
  WHERE m.company_id = p_company AND m.user_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION private.company_role(uuid) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.company_role(uuid) TO authenticated;

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON public.company_members
FOR SELECT TO authenticated
USING (private.company_role(company_id) IS NOT NULL);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_read ON public.companies
FOR SELECT TO authenticated
USING (private.company_role(id) IS NOT NULL);
CREATE POLICY companies_rename ON public.companies
FOR UPDATE TO authenticated
USING (private.company_role(id) IN ('owner','editor') AND archived_at IS NULL)
WITH CHECK (private.company_role(id) IN ('owner','editor') AND archived_at IS NULL);
GRANT SELECT, UPDATE(name) ON public.companies TO authenticated;

ALTER TABLE public.knowledge_entry_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY revisions_read ON public.knowledge_entry_versions
FOR SELECT TO authenticated
USING (private.company_role(company_id) IS NOT NULL);
GRANT SELECT ON public.knowledge_entry_versions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_entry_versions
FROM PUBLIC, anon, authenticated;
DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scrape_jobs','source_pages',
    'knowledge_entries','knowledge_base_versions'] LOOP
    EXECUTE format('CREATE POLICY tenant_read ON public.%I '
      'FOR SELECT TO authenticated USING '
      '(private.company_role(company_id) IS NOT NULL)', t);
  END LOOP;
END $policies$;
-- The table-wide revocation precedes UPDATE(name), preventing inherited
-- table grants from accidentally allowing changes to IDs or counters.
```

The name-only grant prevents an authenticated client from assigning a different company ID or changing protected counters/website. The rename policy checks both the old and new row; a trigger increments `draft_generation` on a name change and updates `updated_at`. A row update locks the same company row used for snapshot publication. A separate protected website change function revalidates the submitted URL, locks the company and increments draft generation without changing old evidence.

## Protected functions and trust boundaries

Own tables/functions with a dedicated non-login migration-owner role, not an application login. Use `SECURITY DEFINER SET search_path = ''`, fully qualify every object, revoke default function EXECUTE from PUBLIC/anon, then grant only the intended operation to authenticated or the worker login. Revoke CREATE on protected schemas from application roles. SQL callers cannot supply arbitrary author IDs; derive authors from `auth.uid()` for user operations, or the stored authorized requester for worker-created first imports. Do not silently run a user operation using elevated credentials. Supabase's [function security guidance](https://supabase.com/docs/guides/database/functions) explains definer privileges and execution restrictions.

```sql
CREATE FUNCTION public.create_company(p_name text, p_website text, p_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user uuid := auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  -- Validate name/URL syntax and enforce per-user company creation limits.
  -- Network validation is performed by enqueue/worker before any fetch.
  INSERT INTO public.companies(name, website_url, created_by, creation_request_id)
    VALUES (p_name, p_website, v_user, p_request)
    ON CONFLICT (created_by, creation_request_id) DO NOTHING
    RETURNING id INTO v_company;
  IF v_company IS NULL THEN
    SELECT c.id INTO v_company FROM public.companies AS c
      WHERE c.created_by = v_user AND c.creation_request_id = p_request
        AND c.name = p_name AND c.website_url = p_website;
    IF v_company IS NULL THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN v_company;
  END IF;
  INSERT INTO public.company_members(company_id, user_id, role, added_by)
    VALUES (v_company, v_user, 'owner', v_user);
  RETURN v_company;
END $$;
REVOKE ALL ON FUNCTION public.create_company(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company(text,text,uuid) TO authenticated;
```

The function call is one transaction; failure of membership insertion rolls back the company. The relational creation request key makes identical creation retries safe; reuse with different values is rejected. Membership changes call `set_company_member(company,user,role_or_remove)`: lock the company, require caller owner, validate target Auth user exists, forbid self-promotion by non-owners, and reject removing/demoting the last owner. Locking the company serializes concurrent owner removals. The first owner is created only by `create_company`, not a general self-enrollment policy. Users may not insert their own membership directly.

`save_entry_revision`, `apply_proposal`, `revert_entry` and `publish_knowledge_base` each lock the company row, recheck caller role and archive state, validate tenant relationships and JSON, then perform their bounded operation in one transaction. Every entry reference is looked up using both company and entry ID. A request including another company's entry/source/version yields a generic unavailable response, not an information leak.

The worker uses a dedicated PostgreSQL login with no direct table grants, permitted to execute only private `claim_job`, `heartbeat_job`, `insert_source_capture`, `checkpoint_job`, `finish_job`, and `fail_job`. These functions authorize via restricted database role grants, validate the lease and company IDs, and recheck the stored requester's owner/editor membership and company archive state before processing/finalization. Removal of access stops further ingestion/import. No worker function accepts a caller-selected arbitrary user as its authority. Schema/function ownership and connection credentials remain outside the renderer. If a service-role credential is introduced later, it remains server-side and must not replace operation-level membership checks.

# API and background-job contracts

Use `/api/companies/:companyId/...` so the company is explicit. User requests carry a Supabase authenticated session; use a verified server-side user identity, not a decoded-but-unverified JWT or browser-supplied user ID. Responses use `{data, error, requestId}` and sanitized typed errors. Validate bodies, query strings, route IDs and responses with the shared contract. Limit JSON body sizes and per-user/company scrape rates.

| Operation | Input and output | Authorization and behavior |
| --- | --- | --- |
| `POST /api/companies` | `{name,website,requestId}` → `{companyId,role:"owner"}` | Signed-in; atomic company/owner creation. |
| `GET /api/companies` | Cursor → accessible company summaries | Member-scoped RLS, no cross-company search. |
| `PATCH /api/companies/:c` | `{name?,website?,expectedGeneration}` → company | Owner/editor; protected URL changes; stale generation 409. |
| `POST /api/companies/:c/archive` | `{expectedGeneration}` → archived company | Owner only, cancel active jobs and block writes. |
| `PUT /api/companies/:c/members/:u` | `{role}` or `{remove:true}` → roster | Owner only; protect last owner. |
| `POST /api/companies/:c/scrapes` | `{url,options?,requestId}` → `202 {jobId,status}` | Owner/editor; validate scope/options; same request ID returns same job. One active job: 409 with accessible active ID. |
| `GET /api/companies/:c/scrapes/:j` | → job state, counts, safe errors, proposal summary | Member; refresh-safe polling. |
| `POST /api/companies/:c/scrapes/:j/cancel` | `{}` → cancelling/terminal | Owner/editor; cooperative cancellation checked between tasks. |
| `GET /api/companies/:c/draft` | → generation, current entries, provenance, coverage | Member; no-store. |
| `POST /api/companies/:c/entries` | `{kind,content,provenance,requestId}` → revision 1 | Owner/editor; create person/offering or missing singleton only; validate IDs and origin. |
| `POST /api/companies/:c/entries/:e/revisions` | `{expectedRevision,content,provenance,reviewStatus,reason?,requestId}` → immutable revision/current generation | Owner/editor; origin recomputed for edited leaves; stale edit 409. |
| `POST /api/companies/:c/entries/:e/revert` | `{fromRevision,expectedRevision,requestId}` → new unreviewed revision | Owner/editor; copy prior state, never mutate it. |
| `POST /api/companies/:c/proposals/:p/apply` | `{jobId,entryId?,expectedRevision?,selectedCandidateIds,requestId}` → new unreviewed revision | Owner/editor; source/company and latest-revision validation. |
| `POST /api/companies/:c/proposals/:p/dismiss` | `{jobId,reason?}` → recorded decision | Owner/editor; append decision, retain candidates. |
| `GET /api/companies/:c/entries/:e/history` | → immutable revisions | Member; company-qualified. |
| `GET /api/companies/:c/preview` | → `{draftGeneration,payloadPreview,blockingEntries}` | Member; final IDs/time/version assigned only on publish. |
| `POST /api/companies/:c/versions` | `{expectedGeneration,requestId}` → `{versionId,version}` | Owner/editor; atomic publication. |
| `GET /api/companies/:c/versions` | → version summaries | Member. |
| `GET /api/companies/:c/versions/:v` | → stored payload | Member; no reconstruction from current records. |
| `GET /api/companies/:c/versions/:v/download` | → JSON attachment | Member, UTF-8 application/json, safe filename. |

For revision idempotency, store the request UUID in that immutable revision's provenance operation metadata and have the protected function, under the company lock, return the prior matching operation before writing again. Reject reuse with a different body. Job/snapshot idempotency has relational unique keys. Do not depend on frontend button disabling for duplicate protection.

```ts
type JobStatus = 'queued' | 'validating' | 'crawling' | 'extracting'
  | 'succeeded' | 'partial' | 'failed' | 'cancelled';
type Progress = {
  stage: JobStatus;
  discovered: number; selected: number; captured: number;
  failed: number; blocked: number; extracted: number;
  document_limit: number; limits_reached: string[];
};
type SafeJobError = {
  code: string; url: string | null; retryable: boolean; message: string;
};
type Proposal = {
  id: string; kind: EntryKind; target_entry_id: string | null;
  base_revision: number | null; schema_version: '1.0.0';
  content: BusinessEntry; provenance: EntryProvenance;
  conflicts: CandidateConflict[];
};
// Private DB operations, not HTTP endpoints exposed to browsers:
// claim_job(worker_id) -> {job_id,company_id,lease_token,checkpoint}
// checkpoint_job(job_id,company_id,lease_token,checkpoint,progress)
// finish_job(job_id,company_id,lease_token,validated_proposals,coverage)
```

Normal transition is queued → validating → crawling → extracting → succeeded/partial. Any active stage can fail or cancel; expired leases resume the last persisted stage after a new claim. Succeeded means the selected bounded crawl/extraction finished, not that every possible website fact exists. Partial means at least some usable results plus a failed/skipped/truncated relevant component. Failed means no usable validated result. Cancellation preserves completed source pages; it does not auto-import unfinished proposals. Refusals, invalid output and extraction timeouts are recorded per page/category and make affected coverage partial/not_checked. A terminal first-import transaction is idempotent and creates entries only if the company has no entries; a human-created draft makes the entire scrape proposal-only.

Use 400 for malformed input, 401 signed-out, 404 unavailable/non-member resource, 403 for an accessible company with insufficient role, 409 for stale state/idempotency conflicts, 422 for business validation, 429 for rate limits and 503 for temporary provider unavailability. Transient fetch/model errors retry once per task within job time/token budgets; process crash retries use the lease mechanism. Return actionable safe messages and preserve draft data during failures.

# Versioning and export

## Revisions and publication transactions

An explicit save, approve, reject, clear, proposal acceptance, or revert inserts a new immutable entry revision. Review-status-only operations copy content and provenance into a new revision with the new status. No revision is written on each keystroke. Unchanged source-derived fields retain their evidence and origin; edited leaves become user-provided and retain a link to their superseded claim. Merely approving inferred/generated content leaves its origin unchanged. Reverting copies the earlier content/provenance into a new unreviewed revision with a reason and `reverted_from_revision` reference.

Use the company row as the single transactional serialization lock for all draft changes, membership changes and publication. Under `SELECT ... FOR UPDATE`, check membership again, verify `expectedRevision = current_revision`, validate content/evidence, insert revision `current_revision + 1`, update the pointer, and increment `draft_generation`. New entries insert their identity and revision 1 in one transaction; the deferred pointer FK becomes valid at commit. An expected-revision mismatch returns 409 with the current revision; the UI preserves unsaved edits for a manual comparison. Do not silently retry edits against a new base.

Snapshot creation is one protected database transaction:

1. Lock the company row; reject archived companies or insufficient caller role.
2. Return the existing snapshot for a matching publication request ID; reject body/key mismatch. Otherwise check the expected draft generation.
3. Read all current entry revisions under the lock. Require zero unreviewed entries and at least one approved entry. Include only approved entries, with their exact revision IDs in the manifest; rejected entries remain historical but are excluded.
4. Start from the complete empty business schema, insert approved section content and people/offerings, then validate the complete contract. No client-supplied approved subset may hide unresolved entries. Copy only their referenced evidence plus coverage metadata into provenance.
5. Allocate a snapshot UUID and timestamp. Take `version_number = companies.next_snapshot_version`, then increment that counter inside this same transaction. Never use an unlocked `MAX()+1`.
6. Assemble JSON in a versioned SQL assembler using the same declarative field registry/defaults as TypeScript. Validate JSON structure, company/source/manifest references, per-leaf claims, approved states and limits in the protected function. Generate stable canonical UTF-8 serialization rules for hashing.
7. Freeze company name, submitted/validated website metadata, snapshot author, relevant source metadata and excerpts in `provenance`; insert the snapshot and checksum. Commit and return its saved ID/number.

The SQL assembler is intentionally small: five singleton object copies, two repeatable collections, defaults, and provenance aggregation. Generate its default objects/validation field registry from the shared schema during development and test parity with the TypeScript assembler. Do not hold a database transaction open while calling an LLM or rendering a browser. Concurrency tests must prove that a content save either appears wholly before a snapshot or wholly after it.

Download reads only `knowledge_base_versions.payload`, serializes with the defined canonical serializer and returns `Content-Disposition: attachment; filename="{company-slug}-knowledge-base-v{version}.json"`. Derive the slug from frozen company name, constrain it to safe ASCII slug characters, and use a fixed fallback. The hash is computed from that same canonical JSON representation; jsonb internal ordering is not treated as byte-stable by itself. JSON preview can pretty-print the stored payload without changing its values. Stored schema versions remain available; never migrate an old snapshot in place. A future export conversion would be an explicitly new artifact/version.

## Stable paths and content provenance

Use plain business values; do not wrap each business field in `{value,source}`. Every repeatable business entity has an `id` UUID, including nested features, addresses, colors and CTA steps. Fixed enum sets such as font observation methods are canonical sorted technical metadata, not reorderable business entities; their leaf pointers can use indices. Provenance targets use a documented stable-pointer syntax: ordinary JSON Pointer escaping for object keys plus `@<uuid>` segments to select array items by their `id`, for example `/offerings/@<offering-id>/pricing/amount` and `/company_foundation/other_locations/@<location-id>/city`. This is an application extension, not a claim that a normal RFC 6901 resolver can resolve IDs.

Reordering arrays changes no IDs, claims or evidence targets. Export people/offerings in stable entry-creation order with ID as tie breaker; UI sorting is presentation-only. Editing the order of a nested array is an explicit parent-entry revision. New items receive new IDs, retained items keep IDs, and deleted IDs remain referenced only in historical revisions. Reject duplicate IDs or provenance that points to removed values. Item IDs and application-generated snapshot/entry metadata do not need website citations; every populated business leaf does.

Claims contain explicit target paths, content origin, extraction assessment and evidence references. Reuse one claim across several leaves only when its evidence really supports every named target. Different origins within an object require separate claims. Coverage assessments exist at all required category field paths, including unknown values and required person/offering fields. Each annotation independently records extraction assessment and last job; review belongs to the entry revision. `not_found` describes bounded observation, not a universal negative. User-supplied material may coexist with `not_found`/`not_checked` extraction coverage. Clear rejected content from export values while retaining the category coverage and rejection explanation.

Conflicting candidates stay in immutable revision/job provenance, each with its own evidence; exported approved values reference only the reviewer-selected candidate, with a bounded conflict-resolution record. Rejected sensitive/unnecessary candidates remain internal rather than automatically appearing in an approved snapshot. A generated pitch/persona references supporting claim IDs and evidence. Generated origin remains visible even after revisions approve it.

## Reusable validation contract

The following are proposed TypeScript domain types to implement as strict Zod schemas. All listed object properties are required unless marked optional; scalar unknowns use null, collections use empty arrays. `UUID`, `URL`, `DateOnly` and `Instant` are validated branded strings, not arbitrary text. `URL` means absolute HTTP(S); server fetching requires the additional network gate. Numeric money uses decimal strings to preserve precision.

```ts
type UUID = string; type URL = string;
type DateOnly = string; type Instant = string;
type IdentifiedText = { id: UUID; text: string };
type Address = {
  id: UUID; label: string | null; raw: string | null;
  line1: string | null; line2: string | null; city: string | null;
  region: string | null; postal_code: string | null; country: string | null;
};
type EmployeeCount = {
  raw: string; exact: number | null; min: number | null; max: number | null;
  as_of: DateOnly | null;
};
type Persona = {
  id: UUID; name: string | null; role: string | null;
  organization_type: string | null;
  goals: IdentifiedText[]; pain_points: IdentifiedText[];
};
type Partner = {
  id: UUID; name: string | null; relationship_type: string | null;
  relationship_text: string | null; url: URL | null;
};
type Commentary = {
  id: UUID; text: string; publisher: string | null; published_on: DateOnly | null;
};
type Channel = {
  id: UUID; channel_type: string | null; label: string | null; url: URL | null;
};
type Funnel = {
  id: UUID; name: string | null;
  steps: {id: UUID; label: string; url: URL | null}[];
};
type CTA = {id: UUID; label: string; url: URL | null; purpose: string | null};
type Font = {
  id: UUID; family: string; apparent_use: string | null;
  observations: ('css_declared' | 'resource_loaded' | 'computed_family')[];
  brand_confirmed: boolean;
};
type Color = {
  id: UUID; hex: string; alpha: number; apparent_role: string | null;
  classification: 'observed_website_color' | 'brand_guide_confirmed';
};
type Logo = {id: UUID; url: URL; variant: string | null; kind: 'company_logo'};
type SocialLink = {id: UUID; platform: string; profile_url: URL};
type Person = {
  id: UUID; name: string | null; title: string | null; role: string | null;
  gender: string | null; background_or_relevance: string | null;
};
type Pricing = {
  kind: 'free' | 'paid' | 'contact_for_pricing'; raw: string;
  amount: string | null; min_amount: string | null; max_amount: string | null;
  currency: string | null; billing_interval: string | null;
  pricing_model: string | null; qualifications: IdentifiedText[];
  as_of: DateOnly | null;
};
type Offering = {
  id: UUID; name: string | null; description: string | null;
  offering_type: string | null; category: string | null;
  features: IdentifiedText[]; pricing: Pricing | null; url: URL | null;
};
type CompanyFoundation = {
  overview: string | null; website: URL | null; industry: string | null;
  business_model: string | null; company_role: IdentifiedText[];
  year_founded: number | null; legal_entity_type: string | null;
  employee_count: EmployeeCount | null; main_address: Address | null;
  other_locations: Address[]; service_locations: IdentifiedText[];
  alternative_company_names: IdentifiedText[];
};
type Positioning = {company_pitch: string | null; founding_story: string | null};
type MarketAndCustomers = {
  target_buyers: IdentifiedText[]; customer_needs: IdentifiedText[];
  ideal_customer_personas: Persona[]; industry_groupings: IdentifiedText[];
  industry_outlook: Commentary[]; channels: Channel[];
  funnels: Funnel[]; ctas: CTA[]; suppliers_and_partners: Partner[];
};
type BrandingAndStyle = {
  writing_style_description: string | null; art_style_description: string | null;
  fonts: Font[]; brand_colors: Color[]; logos: Logo[];
};
type OnlinePresence = {social_media_links: SocialLink[]};
type Origin = 'source_backed' | 'inferred' | 'generated' | 'user_provided';
type Assessment = 'found' | 'not_found' | 'not_checked' | 'partial' | 'conflict';
type Source = {
  id: UUID; url: URL; title: string | null; author: string | null;
  site_name: string | null; published_on: DateOnly | null;
  retrieved_at: Instant;
};
type Evidence = {
  id: UUID; source_page_id: UUID; kind: 'text' | 'technical';
  excerpt: string | null;
  technical: {
    selector: string | null; property: string | null; value: string | null;
    asset_url: URL | null;
  } | null;
};
type Claim = {
  id: UUID; entry_id: UUID; targets: string[]; origin: Origin;
  evidence_ids: UUID[]; based_on_claim_ids: UUID[];
  actor_id: UUID | null; authored_at: Instant | null;
  note: string | null;
};
type EntryState = {
  entry_id: UUID; kind: EntryKind; revision: number;
  review_status: 'approved' | 'rejected'; author_id: UUID; saved_at: Instant;
};
type CoverageAssessment = {
  targets: string[]; status: Assessment; job_id: UUID | null; reason: string | null;
};
type ExportProvenance = {
  company: {name: string; website: URL; snapshot_author_id: UUID};
  entries: EntryState[]; sources: Source[]; evidence: Evidence[]; claims: Claim[];
  coverage: CoverageAssessment[];
  operations: {
    request_id: UUID; entry_id: UUID | null; kind: string;
    supersedes_claim_id: UUID | null; note: string | null;
  }[];
};
type KnowledgeBaseExport = {
  schema_version: '1.0.0'; company_id: UUID; knowledge_base_version_id: UUID;
  version: number; saved_at: Instant;
  company_foundation: CompanyFoundation; positioning: Positioning;
  market_and_customers: MarketAndCustomers; branding_and_style: BrandingAndStyle;
  online_presence: OnlinePresence; key_people: Person[]; offerings: Offering[];
  provenance: ExportProvenance;
};
type EntryKind = 'company_foundation' | 'positioning' | 'market_and_customers'
  | 'branding_and_style' | 'online_presence' | 'key_person' | 'offering';
type BusinessEntry = CompanyFoundation | Positioning | MarketAndCustomers
  | BrandingAndStyle | OnlinePresence | Person | Offering;
// EntryProvenance uses the same claims/evidence/coverage/operations shapes;
// its internal entry state also permits review_status: 'unreviewed'.
```

Zod refinements enforce unique UUIDs per collection, all required keys, no unknown keys, bounded strings/arrays, sensible founding years, nonnegative whole employee counts, `min <= max`, and mutually exclusive exact/range forms. The `raw` employee wording remains intact even when numbers cannot be normalized. Pricing has exactly one amount or range when numeric pricing is known; no manufactured numeric zero for free/contact pricing. Free is represented by `kind:"free"` and its actual raw wording; not-found pricing is null with a coverage assessment, and contact pricing has its own kind. Currency/interval stay null unless stated. Color is `#RRGGBB` plus alpha in [0,1]. Gender populated by extraction requires explicit self-description evidence; a user entry requires the same attestation, not a guess.

Every evidence ID resolves to a frozen source with matching URL/retrieval time, indirectly supplying those metadata per claim. Every non-null/nonempty business leaf except item IDs resolves to at least one compatible claim. Generated/inferred claims require supporting evidence; generated claims can reference earlier source claims without cycles. User claims require actor/time and a correction note, and may lack website evidence. Neither review status nor a schema-valid model response grants source-backed origin. Coverage must resolve exactly once for each required field (empty collection field or each required field on existing people/offerings); grouped `targets` are a compact representation, not inheritance that hides omissions.

Use these business types for model candidate content, editor validation, revision persistence, snapshot assembly and export. Their surrounding envelopes differ: extraction allows unresolved candidates and conflicts; saved entries permit unreviewed state; export permits approved selected values only. This avoids forcing an LLM to invent IDs, authors, source metadata or review decisions. The worker assigns stable UUIDs after validation and maps segment evidence IDs to stored sources.

## Complete illustrative export

All names, identifiers, text and URLs in this example are fictional. The company has five approved singleton sections, one approved person, and one approved offering. It demonstrates unknown values, an approved generated pitch, inferred writing style, and a user-provided address correction. The unknown gender is intentional. Three example sources are frozen in provenance; technical evidence belongs to the captured homepage and its observed assets.

```json
{
  "schema_version": "1.0.0",
  "company_id": "10000000-0000-4000-8000-000000000001",
  "knowledge_base_version_id": "10000000-0000-4000-8000-000000000002",
  "version": 1,
  "saved_at": "2026-10-16T05:00:00Z",
  "company_foundation": {
    "overview": "Lumen Ledger provides inventory software for independent retailers.",
    "website": "https://lumen-ledger.example/",
    "industry": "Retail software",
    "business_model": null,
    "company_role": [],
    "year_founded": null,
    "legal_entity_type": null,
    "employee_count": null,
    "main_address": {
      "id": "20000000-0000-4000-8000-000000000001",
      "label": null,
      "raw": "11 Market Street, Portland, OR 97205, United States",
      "line1": "11 Market Street",
      "line2": null,
      "city": "Portland",
      "region": "OR",
      "postal_code": "97205",
      "country": "United States"
    },
    "other_locations": [],
    "service_locations": [],
    "alternative_company_names": []
  },
  "positioning": {
    "company_pitch": "Keep your independent shop organized with Lumen Ledger inventory software.",
    "founding_story": null
  },
  "market_and_customers": {
    "target_buyers": [
      {
        "id": "20000000-0000-4000-8000-000000000006",
        "text": "Independent retailers"
      }
    ],
    "customer_needs": [],
    "ideal_customer_personas": [],
    "industry_groupings": [],
    "industry_outlook": [],
    "channels": [],
    "funnels": [],
    "ctas": [
      {
        "id": "20000000-0000-4000-8000-000000000002",
        "label": "See pricing",
        "url": "https://lumen-ledger.example/pricing",
        "purpose": null
      }
    ],
    "suppliers_and_partners": []
  },
  "branding_and_style": {
    "writing_style_description": "The sampled homepage uses short, direct sentences and retail vocabulary.",
    "art_style_description": null,
    "fonts": [
      {
        "id": "20000000-0000-4000-8000-000000000003",
        "family": "Inter",
        "apparent_use": "Body text",
        "observations": [
          "css_declared"
        ],
        "brand_confirmed": false
      }
    ],
    "brand_colors": [
      {
        "id": "20000000-0000-4000-8000-000000000004",
        "hex": "#2457D6",
        "alpha": 1,
        "apparent_role": null,
        "classification": "observed_website_color"
      }
    ],
    "logos": [
      {
        "id": "20000000-0000-4000-8000-000000000005",
        "url": "https://lumen-ledger.example/assets/logo.svg",
        "variant": null,
        "kind": "company_logo"
      }
    ]
  },
  "online_presence": {
    "social_media_links": []
  },
  "key_people": [
    {
      "id": "30000000-0000-4000-8000-000000000006",
      "name": "Alex Chen",
      "title": "Founder",
      "role": "Founder of Lumen Ledger",
      "gender": null,
      "background_or_relevance": null
    }
  ],
  "offerings": [
    {
      "id": "30000000-0000-4000-8000-000000000007",
      "name": "Shop Inventory",
      "description": "Inventory software for independent retailers.",
      "offering_type": "Subscription",
      "category": null,
      "features": [],
      "pricing": {
        "kind": "paid",
        "raw": "Shop Inventory subscription: USD 29 per workspace per month.",
        "amount": "29.00",
        "min_amount": null,
        "max_amount": null,
        "currency": "USD",
        "billing_interval": "month",
        "pricing_model": "per_workspace",
        "qualifications": [],
        "as_of": null
      },
      "url": "https://lumen-ledger.example/pricing"
    }
  ],
  "provenance": {
    "company": {
      "name": "Lumen Ledger",
      "website": "https://lumen-ledger.example/",
      "snapshot_author_id": "40000000-0000-4000-8000-000000000001"
    },
    "entries": [
      {
        "entry_id": "30000000-0000-4000-8000-000000000001",
        "kind": "company_foundation",
        "revision": 3,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      },
      {
        "entry_id": "30000000-0000-4000-8000-000000000002",
        "kind": "positioning",
        "revision": 2,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      },
      {
        "entry_id": "30000000-0000-4000-8000-000000000003",
        "kind": "market_and_customers",
        "revision": 2,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      },
      {
        "entry_id": "30000000-0000-4000-8000-000000000004",
        "kind": "branding_and_style",
        "revision": 2,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      },
      {
        "entry_id": "30000000-0000-4000-8000-000000000005",
        "kind": "online_presence",
        "revision": 2,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      },
      {
        "entry_id": "30000000-0000-4000-8000-000000000006",
        "kind": "key_person",
        "revision": 2,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      },
      {
        "entry_id": "30000000-0000-4000-8000-000000000007",
        "kind": "offering",
        "revision": 2,
        "review_status": "approved",
        "author_id": "40000000-0000-4000-8000-000000000001",
        "saved_at": "2026-10-16T04:59:00Z"
      }
    ],
    "sources": [
      {
        "id": "50000000-0000-4000-8000-000000000001",
        "url": "https://lumen-ledger.example/",
        "title": "Lumen Ledger",
        "author": "Lumen Ledger",
        "site_name": "Lumen Ledger",
        "published_on": null,
        "retrieved_at": "2026-10-16T04:30:00Z"
      },
      {
        "id": "50000000-0000-4000-8000-000000000002",
        "url": "https://lumen-ledger.example/about",
        "title": "About Lumen Ledger",
        "author": "Lumen Ledger",
        "site_name": "Lumen Ledger",
        "published_on": null,
        "retrieved_at": "2026-10-16T04:30:10Z"
      },
      {
        "id": "50000000-0000-4000-8000-000000000003",
        "url": "https://lumen-ledger.example/pricing",
        "title": "Shop Inventory Pricing",
        "author": "Lumen Ledger",
        "site_name": "Lumen Ledger",
        "published_on": null,
        "retrieved_at": "2026-10-16T04:30:20Z"
      }
    ],
    "evidence": [
      {
        "id": "60000000-0000-4000-8000-000000000001",
        "source_page_id": "50000000-0000-4000-8000-000000000001",
        "kind": "text",
        "excerpt": "Retail software. Lumen Ledger provides inventory software for independent retailers.",
        "technical": null
      },
      {
        "id": "60000000-0000-4000-8000-000000000002",
        "source_page_id": "50000000-0000-4000-8000-000000000001",
        "kind": "technical",
        "excerpt": null,
        "technical": {
          "selector": null,
          "property": "validated_final_url",
          "value": "https://lumen-ledger.example/",
          "asset_url": null
        }
      },
      {
        "id": "60000000-0000-4000-8000-000000000003",
        "source_page_id": "50000000-0000-4000-8000-000000000001",
        "kind": "technical",
        "excerpt": "See pricing",
        "technical": {
          "selector": "a.pricing-link",
          "property": "href",
          "value": "https://lumen-ledger.example/pricing",
          "asset_url": null
        }
      },
      {
        "id": "60000000-0000-4000-8000-000000000004",
        "source_page_id": "50000000-0000-4000-8000-000000000001",
        "kind": "technical",
        "excerpt": null,
        "technical": {
          "selector": "body",
          "property": "font-family",
          "value": "Inter, sans-serif",
          "asset_url": null
        }
      },
      {
        "id": "60000000-0000-4000-8000-000000000005",
        "source_page_id": "50000000-0000-4000-8000-000000000001",
        "kind": "technical",
        "excerpt": null,
        "technical": {
          "selector": "button",
          "property": "background-color",
          "value": "rgb(36, 87, 214)",
          "asset_url": null
        }
      },
      {
        "id": "60000000-0000-4000-8000-000000000006",
        "source_page_id": "50000000-0000-4000-8000-000000000001",
        "kind": "technical",
        "excerpt": "Header image alt: Lumen Ledger",
        "technical": {
          "selector": "header img",
          "property": "src",
          "value": "/assets/logo.svg",
          "asset_url": "https://lumen-ledger.example/assets/logo.svg"
        }
      },
      {
        "id": "60000000-0000-4000-8000-000000000007",
        "source_page_id": "50000000-0000-4000-8000-000000000002",
        "kind": "text",
        "excerpt": "Alex Chen, Founder of Lumen Ledger.",
        "technical": null
      },
      {
        "id": "60000000-0000-4000-8000-000000000008",
        "source_page_id": "50000000-0000-4000-8000-000000000003",
        "kind": "text",
        "excerpt": "Shop Inventory. Inventory software for independent retailers. Shop Inventory subscription: USD 29 per workspace per month.",
        "technical": null
      }
    ],
    "claims": [
      {
        "id": "70000000-0000-4000-8000-000000000001",
        "entry_id": "30000000-0000-4000-8000-000000000001",
        "targets": [
          "/company_foundation/overview",
          "/company_foundation/industry"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000001"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": null
      },
      {
        "id": "70000000-0000-4000-8000-000000000002",
        "entry_id": "30000000-0000-4000-8000-000000000001",
        "targets": [
          "/company_foundation/website"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000002"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": null
      },
      {
        "id": "70000000-0000-4000-8000-000000000003",
        "entry_id": "30000000-0000-4000-8000-000000000001",
        "targets": [
          "/company_foundation/main_address/raw",
          "/company_foundation/main_address/line1",
          "/company_foundation/main_address/city",
          "/company_foundation/main_address/region",
          "/company_foundation/main_address/postal_code",
          "/company_foundation/main_address/country"
        ],
        "origin": "user_provided",
        "evidence_ids": [],
        "based_on_claim_ids": [],
        "actor_id": "40000000-0000-4000-8000-000000000001",
        "authored_at": "2026-10-16T04:55:00Z",
        "note": "Reviewer corrected an earlier manual draft address from 10 Market Street to 11 Market Street; this address is not confirmed by the website."
      },
      {
        "id": "70000000-0000-4000-8000-000000000004",
        "entry_id": "30000000-0000-4000-8000-000000000002",
        "targets": [
          "/positioning/company_pitch"
        ],
        "origin": "generated",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000001"
        ],
        "based_on_claim_ids": [
          "70000000-0000-4000-8000-000000000001"
        ],
        "actor_id": null,
        "authored_at": "2026-10-16T04:35:00Z",
        "note": "Generated wording explicitly approved in positioning revision 2."
      },
      {
        "id": "70000000-0000-4000-8000-000000000005",
        "entry_id": "30000000-0000-4000-8000-000000000003",
        "targets": [
          "/market_and_customers/ctas/@20000000-0000-4000-8000-000000000002/label",
          "/market_and_customers/ctas/@20000000-0000-4000-8000-000000000002/url"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000003"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": null
      },
      {
        "id": "70000000-0000-4000-8000-000000000006",
        "entry_id": "30000000-0000-4000-8000-000000000004",
        "targets": [
          "/branding_and_style/writing_style_description"
        ],
        "origin": "inferred",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000001"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": "Interpretation of sampled wording, not an official voice guide."
      },
      {
        "id": "70000000-0000-4000-8000-000000000007",
        "entry_id": "30000000-0000-4000-8000-000000000004",
        "targets": [
          "/branding_and_style/fonts/@20000000-0000-4000-8000-000000000003/family",
          "/branding_and_style/fonts/@20000000-0000-4000-8000-000000000003/apparent_use",
          "/branding_and_style/fonts/@20000000-0000-4000-8000-000000000003/observations/0",
          "/branding_and_style/fonts/@20000000-0000-4000-8000-000000000003/brand_confirmed"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000004"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": "Body declaration only; brand_confirmed=false records the absence of brand-guide confirmation, not a website assertion."
      },
      {
        "id": "70000000-0000-4000-8000-000000000008",
        "entry_id": "30000000-0000-4000-8000-000000000004",
        "targets": [
          "/branding_and_style/brand_colors/@20000000-0000-4000-8000-000000000004/hex",
          "/branding_and_style/brand_colors/@20000000-0000-4000-8000-000000000004/alpha",
          "/branding_and_style/brand_colors/@20000000-0000-4000-8000-000000000004/classification"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000005"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": "Observed opaque CSS color; classification is observation metadata, not a claim of an official brand color."
      },
      {
        "id": "70000000-0000-4000-8000-000000000009",
        "entry_id": "30000000-0000-4000-8000-000000000004",
        "targets": [
          "/branding_and_style/logos/@20000000-0000-4000-8000-000000000005/url",
          "/branding_and_style/logos/@20000000-0000-4000-8000-000000000005/kind"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000006"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": null
      },
      {
        "id": "70000000-0000-4000-8000-000000000010",
        "entry_id": "30000000-0000-4000-8000-000000000006",
        "targets": [
          "/key_people/@30000000-0000-4000-8000-000000000006/name",
          "/key_people/@30000000-0000-4000-8000-000000000006/title",
          "/key_people/@30000000-0000-4000-8000-000000000006/role"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000007"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": null
      },
      {
        "id": "70000000-0000-4000-8000-000000000011",
        "entry_id": "30000000-0000-4000-8000-000000000007",
        "targets": [
          "/offerings/@30000000-0000-4000-8000-000000000007/name",
          "/offerings/@30000000-0000-4000-8000-000000000007/description",
          "/offerings/@30000000-0000-4000-8000-000000000007/offering_type",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing/kind",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing/raw",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing/amount",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing/currency",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing/billing_interval",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing/pricing_model",
          "/offerings/@30000000-0000-4000-8000-000000000007/url"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000008"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": "Offering URL is the frozen source page URL; numeric price is normalized from the quoted original."
      },
      {
        "id": "70000000-0000-4000-8000-000000000013",
        "entry_id": "30000000-0000-4000-8000-000000000003",
        "targets": [
          "/market_and_customers/target_buyers/@20000000-0000-4000-8000-000000000006/text"
        ],
        "origin": "source_backed",
        "evidence_ids": [
          "60000000-0000-4000-8000-000000000001"
        ],
        "based_on_claim_ids": [],
        "actor_id": null,
        "authored_at": null,
        "note": null
      }
    ],
    "coverage": [
      {
        "targets": [
          "/company_foundation/overview",
          "/company_foundation/website",
          "/company_foundation/industry",
          "/market_and_customers/ctas",
          "/branding_and_style/fonts",
          "/branding_and_style/brand_colors",
          "/branding_and_style/logos",
          "/key_people/@30000000-0000-4000-8000-000000000006/name",
          "/key_people/@30000000-0000-4000-8000-000000000006/title",
          "/key_people/@30000000-0000-4000-8000-000000000006/role",
          "/offerings/@30000000-0000-4000-8000-000000000007/name",
          "/offerings/@30000000-0000-4000-8000-000000000007/description",
          "/offerings/@30000000-0000-4000-8000-000000000007/offering_type",
          "/offerings/@30000000-0000-4000-8000-000000000007/pricing",
          "/offerings/@30000000-0000-4000-8000-000000000007/url",
          "/market_and_customers/target_buyers"
        ],
        "status": "found",
        "job_id": "80000000-0000-4000-8000-000000000001",
        "reason": null
      },
      {
        "targets": [
          "/branding_and_style/writing_style_description"
        ],
        "status": "found",
        "job_id": "80000000-0000-4000-8000-000000000001",
        "reason": "Labeled interpretation from sampled homepage text."
      },
      {
        "targets": [
          "/company_foundation/business_model",
          "/company_foundation/company_role",
          "/company_foundation/year_founded",
          "/company_foundation/legal_entity_type",
          "/company_foundation/employee_count",
          "/company_foundation/main_address",
          "/company_foundation/other_locations",
          "/company_foundation/service_locations",
          "/company_foundation/alternative_company_names",
          "/positioning/company_pitch",
          "/positioning/founding_story",
          "/market_and_customers/customer_needs",
          "/market_and_customers/ideal_customer_personas",
          "/market_and_customers/industry_groupings",
          "/market_and_customers/industry_outlook",
          "/market_and_customers/channels",
          "/market_and_customers/funnels",
          "/market_and_customers/suppliers_and_partners",
          "/online_presence/social_media_links",
          "/key_people/@30000000-0000-4000-8000-000000000006/gender",
          "/key_people/@30000000-0000-4000-8000-000000000006/background_or_relevance",
          "/offerings/@30000000-0000-4000-8000-000000000007/category",
          "/offerings/@30000000-0000-4000-8000-000000000007/features"
        ],
        "status": "not_found",
        "job_id": "80000000-0000-4000-8000-000000000001",
        "reason": "No accepted extraction for these fields in the checked pages. Address is user-supplied and pitch is generated; those origins do not change extraction coverage."
      },
      {
        "targets": [
          "/branding_and_style/art_style_description"
        ],
        "status": "not_checked",
        "job_id": "80000000-0000-4000-8000-000000000001",
        "reason": "Visual interpretation step failed; technical CSS and asset observations were captured separately."
      }
    ],
    "operations": [
      {
        "request_id": "90000000-0000-4000-8000-000000000001",
        "entry_id": "30000000-0000-4000-8000-000000000001",
        "kind": "user_correction",
        "supersedes_claim_id": "70000000-0000-4000-8000-000000000012",
        "note": "Superseded manual address claim belongs to internal revision 2; the immutable history retains its original value. No website evidence is claimed for the correction."
      }
    ]
  }
}
```

The `operations.supersedes_claim_id` is an explicit historical reference, not an active claim required to resolve inside this snapshot. Validate it against that company's prior immutable revisions when publishing. Current `claims.based_on_claim_ids`, in contrast, must resolve within the snapshot.

# Phased implementation plan

Implement one phase at a time, keeping each phase usable and reviewable. Database work described here is work to perform during implementation; this planning change does not execute migrations, create an application or run application tests. Use Conventional Commits and conventional task branches, BEM component selectors, and direct execution without the Guild.

## Phase 0 Establish contracts and runtime

**Modules:** package/runtime configuration, shared `contracts` and `defaults`, fixture website, test configuration, security/egress deployment specification. **Database changes:** prepare the seven-table migration and function/grant skeletons for review; no live deployment required to finish this design phase. **Dependencies:** repository access and hosting/model configuration choices.

**Deliverables:** pinned supported versions, project structure, Zod schemas for all required business fields, stable IDs/pointers, typed source/proposal envelopes, and a fixture specification with expected evidence. Put shared business contracts outside UI components so web and worker can use them. Define the BEM blocks `company-dashboard`, `knowledge-editor`, `scrape-progress`, `citation-popover`, and `version-viewer`. Use a small sample render to establish whether Chromium and the enforced proxy work in the chosen host. Record model/API compatibility with strict schema output.

**User-visible outcome:** a sign-in/app shell branded MoFloKnowledge and a static fixture-backed category editor for design review. **Verification:** typecheck/build; contract accepts representative valid/null values and rejects a fabricated exact employee count derived from a range, incomplete objects, malformed IDs and contradictory pricing. **Done:** full schema/defaults reviewed and deployment can run web, worker and isolated renderer. A missing provider capability is resolved before implementing crawl work.

## Phase 1 Company isolation and a manual end-to-end path

**Modules:** Supabase server/browser clients, authenticated layout, dashboard, company switcher, protected company/revision/publication functions, editor and JSON assembly. **Database changes:** create all seven baseline tables, composite/deferred keys, read RLS, restricted grants, membership helpers, atomic company creation, immutable triggers, revision and publish functions. Worker functions may remain inaccessible until Phase 2. **Dependencies:** Phase 0 contracts.

**Deliverables:** create company; manually enter one foundation section; save draft; approve; publish a version; download JSON containing all seven categories with default keys. Default sections need not all be populated to prove the vertical path. Implement stale revisions/generation checks and atomic counters now, before scraping makes data more complex.

**User-visible outcome:** an authenticated user can produce a valid source-labeled/user-labeled company snapshot and export it. **Verification:** database tests prove atomic initial ownership, cross-company denial, viewer read-only behavior, revision increments, immutable history, and unchanged old snapshot after a later edit. **Done:** one-company manual path works and a second tenant cannot access it. No placeholder authorization may remain.

## Phase 2 Durable bounded scraping

**Modules:** worker entry point, job repository, HTTP fetch gate, robots parser, URL normalizer, priority frontier, progress API/component, isolated renderer/proxy. **Database changes:** implement lease claim/heartbeat/checkpoint/finalization functions and source insertion validation using existing tables; no extra queue table. **Dependencies:** Phase 1 tenancy and Phase 0 runtime qualification.

**Deliverables:** enqueue and resume job; bounded same-host crawl; cleaned text/metadata/links; rendered homepage and JS fallback; persisted safe page errors; cancellation and process restart recovery. Install network denial before accepting arbitrary URLs. Start with deterministic foundation observations so this phase can feed one draft section without waiting for all AI fields.

**User-visible outcome:** URL submission yields real progress and a reviewable partial foundation result with source evidence. Refreshing the page or restarting the worker preserves the job. **Verification:** fixture crawl reaches priority pages within limits; duplicate URLs are not fetched twice; blocked pages and robots failures are honest; a killed/restarted worker resumes without duplicate source rows or imports. Security checks reject private destinations, DNS rebinding, redirects to local services, and renderer subresource attempts. **Done:** job lifecycle is durable and no unawaited web-handler work is needed.

## Phase 3 Complete extraction and provenance

**Modules:** model adapter, schema/prompt versions, page candidate extractor, deterministic reducer, technical observation parser, source validator, category form controls. **Database changes:** implement strict proposal/evidence validation and immutable first-import transaction; extend JSON validators, not table count. **Dependencies:** Phase 2 source captures.

**Deliverables:** all 41 required category/person/offering fields attempted and represented, all reusable nested types, origin labels, all required field assessments, CSS/font/color/logo evidence, official social link detection, person restrictions and offering-specific pricing. Add bounded per-page structured extraction; suggestions only for approved schema fields that permit generation. Preserve conflicts with no silent selection.

**User-visible outcome:** all seven categories display results and honest missing/failed status with field-level evidence. **Verification:** fixture golden output includes text, style assets, social link, person and paid offering; absent legal/gender/founding facts remain null; ranges and contact/free/no-price remain distinct; malformed model output and fake citations cannot persist. **Done:** coverage registry and output validate every required field, with zero unexplained populated leaves.

## Phase 4 Review, corrections and re-scraping

**Modules:** category editor/context, history/revert UI, citations, conflict chooser, proposals comparison, save/approve/reject APIs. **Database changes:** complete protected proposal application/dismissal and revision operation-id checks; maintain old revisions/evidence. **Dependencies:** Phases 1 and 3.

**Deliverables:** explicit saves, Save and approve, rejection/exclusion, user provenance for changed leaves, generated-origin preservation, stale-edit 409 recovery, immutable revert, and re-scrape proposal review. Implement the APA popover with keyboard/touch support. Nested collection IDs persist across reorder and editing.

**User-visible outcome:** a reviewer can correct a source statement, approve unknown-containing sections, inspect a citation's original text and approve a generated pitch without relabeling it as quoted fact. **Verification:** approval-only change creates a revision; editing approved content becomes unreviewed; re-scrape leaves approved/user values untouched; applying selected candidates creates an unreviewed revision; array reorder preserves citations; pointer/focus can move into a citation tooltip. **Done:** all current entries can be resolved and no proposal overwrites an edited draft.

## Phase 5 Version management and release acceptance

**Modules:** snapshot preview/publication UI, version list/view/download, card/table/detail modes, search/filter, deployment configuration and minimal health monitoring. **Database changes:** finalize snapshot contract/digest validators, protected manifest assembly and membership/archive operations; indexes only as defined unless profiling justifies more. **Dependencies:** Phase 4 reviewed drafts.

**Deliverables:** preview with expected generation, published snapshots containing only approved current revisions, frozen company/source metadata, safe download names, per-company history, membership management and archive. Enable worker restart policy, backup settings and job-failure visibility. Verify production secret separation and private-network egress constraints.

**User-visible outcome:** a member can browse, search, edit drafts and download any historical version; an owner manages company access. **Verification:** one full fixture E2E path plus focused database concurrency tests; snapshot remains identical after company rename, revision changes and re-scrapes; stale preview is rejected; duplicate publication retries return the same version; concurrent publications get distinct sequential version numbers; last-owner protection holds. **Done:** the definition of done below is satisfied and remaining setup gates are closed.

# Tests, risks, and setup requirements

## Focused test inventory

Routine tests use deterministic HTML/CSS/JSON-LD fixtures, a local controlled website inside the test network, and a recorded structured model response. Production SSRF protections stay enabled for production; tests use a separate explicit fixture-only egress allowlist so allowing localhost in a test cannot leak into runtime configuration. Live websites and live model calls are separate manual qualification checks, not CI dependencies.

| Test layer | Essential assertions |
| --- | --- |
| Unit: normalization | HTTP/HTTPS URLs, tracking removal, meaningful query preservation, redirect deduplication, bounded depth/pages; employee ranges and monetary decimal parsing retain raw text. |
| Unit: schema and missing data | Every required key exists; null/[] defaults; not_found versus not_checked/partial; gender absence accepted; legal entity/founding story not inferred; free/contact/unknown pricing distinct. |
| Unit: evidence and assembly | Excerpt/technical evidence validation; nested IDs and stable paths; origin retained through approval; user corrections supersede source claim rather than changing its quote; defaults and seven-section assembly; no raw page bodies or secrets exported. |
| Unit: candidates | Repeated facts combine evidence; conflicting claims survive; no same-name-only person merge; rejected/refused/incomplete model output cannot initialize entries. |
| Database integration: access | Two companies with different members; cross-company job/source/entry/revision/snapshot and forged JSON references denied; viewer writes denied through both table and RPC paths; non-member and anon have no reads. |
| Database integration: lifecycle | Atomic company/owner insertion and rollback; no self-enrollment/promotion; cannot remove last owner; account/reference deletion restriction; immutable sources/revisions/snapshots reject UPDATE/DELETE. |
| Database integration: versioning | First revision pointer is valid at commit; stale saves fail; revert adds revision; edit resets approval; unreviewed entries block publish; unknowns do not; at least one approval required; matching idempotency replays do not duplicate; counters under concurrency are safe. |
| Worker integration | Lease fencing, checkpoint resumption, timeout/429/robots behavior, one active job/company, cancelled job does not initialize entries, partial results honest, removed requester cannot finalize. |
| Scraping security | Private IPv4/IPv6 and mapped addresses blocked; mixed DNS answers/DNS rebinding blocked; every redirect rechecked; CSS import/browser iframe/XHR/resource cannot reach local/metadata endpoints; robot/CAPTCHA/auth restrictions respected. |
| UI: evidence and edits | Tooltip opens by hover/focus/tap, remains interactive, dismisses correctly; escaped hostile excerpts; unsaved/stale edits retained; role controls match server permissions. |

Keep tests proportional: use representative cases for each boundary, not thousands of exhaustive permutations. Rendering/network isolation needs an integration test in the actual container/network topology; mocking `fetch` cannot prove proxy enforcement. Do not add tests that merely repeat a style class name or implementation detail.

## One essential end-to-end scenario

The controlled site has Home, About/Team, Pricing, Contact and a JavaScript-loaded FAQ; published company overview, employee range, service geography, a name/title with no self-described gender, offering-specific features/pricing, a linked official social profile, CSS font/color declarations and a company logo. Leave founding story, legal entity and industry outlook absent. Include two inconsistent address statements to exercise conflict review, and a disabled/failed optional route to exercise partial coverage.

1. Sign in as owner A and create company A. Verify its initial ownership.
2. Enter the fixture URL, start scrape, refresh while active, and wait for persisted completion/partial status.
3. Open all seven categories. Verify required keys, source/technical citations, honest absent values, and that a logo does not imply a partner relationship.
4. Resolve the address conflict, make a user correction, approve a generated pitch and all desired entries, and reject any others. Gender remains null and does not block the person.
5. Save a knowledge base version; download JSON and validate it against the full export schema, stable pointer resolver and provenance checks. Verify no internal error logs or full source bodies are present.
6. Edit an approved field; its new revision is unreviewed. Download the saved snapshot again and assert the canonical payload/hash are unchanged. Re-scrape and assert the edited value is not overwritten.
7. Sign in as user B, a member only of company B. Direct HTTP, RPC and database requests for A's IDs all return unavailable/no rows. A viewer member of A can download but cannot mutate.

This is one bounded E2E flow; keep lower-level concurrency/network tests outside it so a long UI smoke test does not obscure failures.

## Material risks and controls

| Risk | Control and release check |
| --- | --- |
| Website content absent, client-only, blocked or truncated | Render selectively; show bounded coverage and partial results; never turn a failure into “not found.” |
| Unsupported but schema-valid model claims | Quote/technical-reference checks, origin labels, deterministic validation and required human approval. |
| SSRF or hostile browser page | Enforced public-only proxy, IP pinning/revalidation, no internal renderer access, secret-free browser context, container integration proof. |
| Prompt injection or unsafe text display | Tool-free extraction, strict envelopes, sanitized bounded inputs and escaped rendering. Instructions inside source pages are data. |
| Cross-company references/RLS bypass | Composite FKs, JSON evidence triggers, explicit definer authorization, restricted grants and two-tenant integration tests. |
| Lost work or duplicate import | Persistent checkpoints, lease tokens, unique keys and transactional first import. |
| Accidental history mutation | Append-only triggers and grants; snapshot reads return stored payload, including frozen citations. |
| Excessive model/runtime cost | Page/byte/time/token budgets; deterministic extraction first, one page-sized model task at a time, no automatic recurring crawl. |
| Mutable source or remote asset disappearance | Store source text/hash and citation metadata; exported asset URL is an observation at retrieval time, not a durable asset copy. |
| Personal information and account deletion | Collect relevant public professional facts only; never infer gender. Separate archival retention from later legally required erasure work; do not expose a destructive MVP UI. |

## Setup required before implementation and release

Configure Supabase project URLs/publishable keys, Auth sign-in/redirect URLs, transactional database credentials for the restricted worker role, `OPENAI_API_KEY` and selected structured-output model, and internal renderer/proxy authentication. Only publishable configuration belongs in `NEXT_PUBLIC_*`; database passwords, model keys and private service credentials do not. Use secret management supplied by the host and redact credentials from logs.

Pin Next.js/React/Tailwind/Supabase SDK/Zod/Playwright versions and the Chromium-compatible Linux image in the lockfile/container configuration. Verify Node 22 compatibility, the exact Supabase PostgreSQL version, required extensions/function ownership grants, and direct/pooler connection behavior. Database jobs use short transactions and leases rather than keeping a connection open during a crawl. Confirm Chromium sandboxing, memory limits, forced egress and crash restart in the real deployment. Do not deploy browser execution into a runtime that only supports short HTTP handlers.

Prepare documented commands for schema migration, deterministic tests and starting web/worker services during implementation; no such commands or migrations are executed by this plan. Set authentication/email provider configuration only as required by the chosen sign-in method. Enable managed database backups and minimal monitoring for oldest queued job, expired leases, terminal failure rate and worker health. Polling is sufficient; Supabase Realtime is optional.

Optional enhancements after MVP acceptance are sitemap/robots-aware expansion beyond the initial limits, PDF extraction, periodic re-crawling with explicit user scheduling, external market research with separate origins, asset archiving, richer member invitations and advanced proposal matching. None blocks the core path.

## Definition of done

MoFloKnowledge is ready when an authenticated user can submit a real company website, receive validated structured coverage of all seven categories, inspect field-level APA website evidence and honest origin labels, edit and approve or reject entries, save an immutable company-scoped snapshot, and download valid JSON containing all required keys. A subsequent edit or re-scrape cannot change that snapshot, another company's user cannot read it, and a viewer cannot mutate it. Missing undisclosed information is represented honestly and does not block approval of otherwise valid entries.
