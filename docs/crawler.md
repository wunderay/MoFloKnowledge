# How the crawler works

The crawler turns a company's public website into source-backed knowledge. It visits a bounded set of pages on the company's own site, saves what it captured, extracts supported facts with fixed rules, and hands the results to people for review. Nothing it finds is published without a person approving it.

## 1. Starting a crawl

A crawl starts in one of two ways:

- **Company creation.** When someone creates a company and enters its website, the app queues a crawl of that website with the default limits (10 pages, depth 2) and opens the company with the crawl's progress showing. If queueing fails, the company is still created and the crawl can be started by hand.
- **By hand.** A member presses crawl on the company and can choose a page limit (1–25) and a depth limit (0–3).

Either way the app calls `enqueue_scrape`, which records a job in `scrape_jobs`. The database limits crawls to 10 per company and 30 per user per hour, and a retry with the same request id returns the same job.

## 2. Running the job

A worker claims one job at a time (`claim_job`). The claim gives the worker a lease that lasts 60 seconds. The worker renews it every 15 seconds and passes the company, job and lease token with every write, so a worker that has lost its lease cannot overwrite a newer attempt. A cancel request stops the job at the next renewal. A job is failed after 3 attempts.

There are two ways to run the worker:

- **Always-on worker** (`npm run worker`, `src/worker/main.ts`): a long-running process that loops, claiming the next job whenever one is waiting.
- **Vercel runs** (`/api/worker/run`, `src/worker/run-once.ts`): each call processes one job for up to 4 minutes. If the job is not done, it saves its progress, releases the lease (`release_job`) and calls the endpoint again, and the next run continues where the last one stopped. The endpoint needs a secret bearer token (`CRON_SECRET`). A daily cron call picks up anything left behind. See [deploy-vercel.md](deploy-vercel.md).

## 3. Safety rules for every request

- **URL rules** (`src/worker/network/url-scope.ts`): only `http`/`https` on ports 80 and 443, with no username or password in the URL and a real public hostname (no IP addresses, no `localhost`, a recognised public suffix). Fragments and tracking parameters (`utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_cid`, `mc_eid`) are removed, and query parameters are sorted, so the same page is not fetched twice.
- **Company scope** (`documentScope`): when the starting address is a bare domain or its `www.` form, both `example.com` and `www.example.com` count as one site. When it is any other host, such as `shop.example.com`, only that exact host is crawled. Links or redirects to anywhere else are refused.
- **Public addresses only** (`src/worker/network/destination-policy.ts`): the hostname is resolved first and the connection is pinned to the address that was checked. Private, loopback, link-local and other non-public addresses are refused, which stops a website from steering the crawler into a private network.
- **robots.txt** (`src/worker/crawl/robots.ts`): each site's rules are fetched once, cached and obeyed. Pages that robots.txt disallows are skipped and counted as blocked. A `Crawl-delay` is honoured, and a delay too long to leave room for a fetch ends that page as a deadline miss rather than being waited out. If robots.txt cannot be read (access denied, another 4xx error, or a failure after one retry), the site's pages are treated as blocked. A `Retry-After` on a 429 reply is respected for up to 5 seconds before one retry.
- **Pacing** (`src/worker/crawl/scheduler.ts`): at most 3 page fetches and 1 browser render run at once, with a gap of at least half a second between requests to the same host.

## 4. Choosing pages

The frontier (`src/worker/crawl/frontier.ts`) holds the pages still to visit. It starts with the address the crawl was requested for (after any redirect, the final origin is used for the rest of the crawl) and adds same-site links as pages are captured. It always visits shallower pages first. At the same depth it visits the highest relevance score first, then sorts by address. A link's score comes from its path and label:

| Score | Pages |
|---|---|
| 100 / 85 | about, company, firm, background, team, leadership and founder pages (100 when one path segment deep, otherwise 85) |
| 95 / 80 | services, products, offerings, solutions and pricing pages (95 when one path segment deep, otherwise 80) |
| 90 | contact and location pages |
| 65 | FAQ and brand pages |
| 55 | appointment, scheduling and booking pages |
| 45 | referral, newsletter and subscribe pages |
| 10 | blog, news, articles and learning-center pages |
| 5 | privacy, terms, legal and login pages |
| 0 | everything else |

The limits are in `src/worker/crawl/budgets.ts`:

| Limit | Value |
|---|---|
| Pages | 1-25 (default 10) |
| Depth | 0-3 links from the starting page (default 2) |
| Pages discovered | at most 200 |
| Time per page | 15 s per fetch, 25 s per browser render |
| Time per crawl | 5 minutes in total |
| Data | 2 MiB of HTML per page; 15 MiB of design files (styles and fonts) |

When a limit is reached, the crawl records which one and finishes with what it has. A partial crawl is labelled as partial, not as complete.

**Browser rendering** is optional. If a renderer is configured (`RENDERER_URL`, `RENDERER_TOKEN`), the starting page and any page that looks client-rendered can be rendered in an isolated browser service (`src/renderer/`) to capture their content and computed styles. Without one, the crawler uses plain fetches, records `render_not_configured` for those pages and reports partial coverage. Rendering arbitrary sites stays off until the renderer host is qualified ([renderer-host-qualification.md](renderer-host-qualification.md)).

**Optional crawl agent** (off by default). With `CRAWL_AGENT_ENABLED=true` plus an API key, model, base URL and prompt file, a language model may order or narrow the links found on each captured page before they join the frontier (`src/worker/agent/`, called from `src/worker/crawl/run-crawl.ts`). Both `npm run worker` and the Vercel route use the same crawl code, so the agent works in both.

- It sees the page address, the number of pages still allowed and the new same-site links on that page. It is asked for an ordered list of the links worth visiting.
- Only links it was offered are used. Anything else it returns is ignored, and a reply with no usable link leaves the normal order unchanged. The links it picks still go through the same scope, depth, page-limit, robots and network rules as any other link.
- It never reads page content for extraction and never writes facts, captures or provenance.
- If the settings are incomplete, the prompt file is missing or empty, or a request fails or times out (10 seconds), the worker writes one error line (never the key) and the rest of the crawl uses the normal order.
- The request is a plain `POST {CRAWL_AGENT_BASE_URL}/chat/completions` to an OpenAI-compatible endpoint. The prompt is the file named by `CRAWL_AGENT_PROMPT` inside `prompts/`, which ships empty.

## 5. Captures and checkpoints

Each fetched or rendered page is stored as a source capture (`insert_source_capture`). The capture holds the page's text, structure and technical observations. As the crawl goes on, the worker saves a checkpoint (`checkpoint_job`) holding the frontier, the budgets used so far, safe error messages, the ids of finished sources and compact validated candidates. Page bodies stay in the source rows. A crawl that is resumed after a restart, a lost lease or a Vercel pause starts again from that checkpoint, using the sources already captured.

## 6. Extraction rules

Extraction (`src/worker/extract/`) maps explicit website evidence to registered fields with fixed rules. Page capture (`src/worker/capture/`) first keeps the page's text as exact segments, plus structured observations: headings, content sections and lists, links, forms, buttons, addresses, price text, JSON-LD, the meta description, declared styles and logos. Navigation, footers, site banners, hidden elements, cookie banners and related-article blocks are left out of the content sections. A candidate is kept only if it cites those segments or observations. The extractor never guesses a field from nearby wording, infers missing facts or writes new copy.

### Supported sources

Every source the extractor reads is listed here. "Field" is the registered field the value goes to (`/group/field`; `@id` means one entry per person or offering). A page-level rule applies to every captured page unless its conditions say otherwise.

**Structured data (`src/worker/extract/structured.ts`)**

| Source | Field(s) | Conditions |
|---|---|---|
| JSON-LD organization (`Organization`, `Corporation`, `LocalBusiness`, `ProfessionalService`, `AccountingService`, `LegalService`, `FinancialService`, `MedicalBusiness`, `Store`, `Restaurant`, `EducationalOrganization`, `NGO`) `description` | `company_foundation/overview` | Its `url` or `@id` must be on the company's site; with neither, it must be the only organization on the page. The value must match the captured text exactly and be 4000 characters or fewer. |
| Same organization, `alternateName` (text or list) | `company_foundation/alternative_company_names` | Same organization rule. |
| Same organization, `address` as an object (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`) or as text | `company_foundation/main_address` (street, city, region, postal code, country; text goes to the raw value) | Only parts that match captured text are used. |
| Same organization, `areaServed` (text, or an object's `name`; text or list) | `company_foundation/service_locations` | Same organization rule. |
| JSON-LD `Person`: `name`, `jobTitle`, `description` | `key_people/@id/name`, `title`, `background_or_relevance` | The person must be nested under, or referenced by `@id` from, an organization's `founder`, `employee` or `member`, or have `worksFor` pointing to the company, or have a name that matches a visible heading. |
| JSON-LD `Service` or `Product`: `name`, `description`, `category`, `url` | `offerings/@id/name`, `description`, `category`, `url` | A `provider`, `url` or `@id` must be on the company's site when present. The `url` is used only when it is the page itself or a link on the page. On a single-service detail page under `/services/`, `/products/` or `/offerings/`, a matching self-link or heading makes that page the offering's address. |
| `offers` on a service or product: `price` and `priceCurrency` | `offerings/@id/pricing` | The price must be a plain non-negative number (`0` stays a paid amount, never "free"). The currency is kept only as a three-letter capital code, otherwise left empty. |
| JSON-LD organization `logo` (text, or an object's `url` or `contentUrl`) | `branding_and_style/logos` | Organization types `Organization`, `LocalBusiness`, `Corporation`, `ProfessionalService`, `AccountingService`, `LegalService`, `MedicalBusiness`, `Store`, `Restaurant` with a same-site `url`, inspected on top level or `@graph` entries only. A logo address containing `favicon` or `brandfetch` is skipped. Only `Organization` and `LocalBusiness` logos become a field candidate (`deterministic.ts`). |

**Page metadata and visible labels (`visible.ts`, `deterministic.ts`)**

| Source | Field(s) | Conditions |
|---|---|---|
| Final address of each captured page | `company_foundation/website` | Every captured page. |
| Meta description (`description`, else `og:description`) | `company_foundation/overview` | Only on the home page (path `/`). |
| Meta description | `offerings/@id/description` | Only on a page whose address is a linked offering (see "Offering links"). |
| Meta description that contains a person's name | `key_people/@id/background_or_relevance` | Only on a person profile page (see below). |
| A line starting `Industry:` | `company_foundation/industry` | Each line is matched from its start; value 4000 characters or fewer. |
| `Business model:` | `company_foundation/business_model` | As above. |
| `Company pitch:` | `positioning/company_pitch` | As above. |
| `Target buyers:` | `market_and_customers/target_buyers` | As above. |
| `Service locations:` | `company_foundation/service_locations` | As above. |
| `Employee count:` | `company_foundation/employee_count` | A whole number (commas allowed), or a range written with `-`, an en or em dash, or `to`, with an optional "employees", "people" or "staff" after it. The raw wording is always kept. Exact, minimum and maximum are filled only when the text is exactly such a number or range. |
| `Founded:`, `Established:`, `Founded in`, `Established in` or `Since` followed by a four-digit year | `company_foundation/year_founded` | The line must start with the label. The year must be between 1000 and the current year. The validator also requires the words "founded" or "established" near the year, or a line that is exactly "Since YYYY". |
| `<address>` and `itemprop="address"` elements (or the renderer's address list) | `company_foundation/main_address` (raw text) | Up to 30 elements. |
| Person profile page: page address ends `/team/<slug>`, `/people/<slug>`, `/staff/<slug>`, `/about-us/<slug>` or `/about/<slug>` | `key_people/@id/name`, `title` | The title reads "Name - Role" (or "Name | Role") with Role one of Co-Founder, Founder, CEO, Chief Executive Officer, Owner, President or Director, or the slug matches the name and exactly one heading is such a role. A visible heading must equal the name. The page must not also carry JSON-LD `Person` data. |

**Offerings (`services-text.ts`, `capture/html.ts`)**

| Source | Field(s) | Conditions |
|---|---|---|
| Offering links: a same-site link whose path is `/services/<slug>`, `/products/<slug>` or `/offerings/<slug>` | `offerings/@id/name` (link text), `url` | The link text is 200 characters or fewer and not a generic action such as "Learn more"; both the link address and its text must be among the captured observations. |
| Offering detail page: the main heading of such a page (matched to a self-link, the address slug, a JSON-LD service name or the single level-1 heading) | `offerings/@id/name`, `url` | The heading is the offering's name. |
| Text under that heading | `offerings/@id/description` | Up to two exact sentences that state what the company provides or offers, in 600 characters or fewer; otherwise the first sentence. Sentences with calls to action, competitor wording, questions or a trailing colon are skipped. |
| List items and "we provide/perform/handle..." sentences on the detail page | `offerings/@id/features` | Exact sentences of up to 300 characters, without negations ("not", "never", "except") or calls to action. Stops at resource, related-article, testimonial and contact sections. |
| A section heading like "Tax Services" or "Business Consulting" that groups links to offerings, or a link whose label is such a category and also appears under another label | `offerings/@id/category` | The category label must end in services, products, representation or consulting, with up to two words before it. Generic headings such as "Our services" are not categories. |
| Sub-services listed on a detail page: estate, gift or trust returns; business start-ups | `offerings/@id/name`, `description`, `category`, `features` | Listed in a list under text such as "services include" or "we offer", and (for start-ups) a sentence about offering start-up help. The parent service is the category. |
| Interim or part-time services sentences ("I can provide part-time ... services") | `offerings/@id/name`, `description`, `features` | Only on `/about`, `/about-us`, `/team`, `/people` and `/staff` pages, never on articles or blog pages. |
| A list introduced by "our services include", "we offer" or similar | `offerings/@id/name`, `url` | The item must be a linked offering or an estate, gift or trust return. Not used on a detail page. |
| A sentence with "primarily", "only", "available to", "existing clients", "requires", "restricted" or "limited to" that contains every key word of a linked offering's name | `offerings/@id/features` of that offering | Same-site offering link only. |
| Offering cards: a `h3` or `h4` heading inside a section headed "Services", "Products" or "Offerings" (up to 30) | `offerings/@id/name`, `description` (the card's paragraph), `url` (the card's link) | Not available for rendered pages. The card's link must be on the same host, and the heading must not contain `|`. |

**Company text (`company-text.ts`)**

These rules run only on pages at `/`, `/services`, `/products`, `/offerings` (the index pages), `/about`, `/about-us`, `/company`, `/firm`, `/firm-background`, `/our-story`, `/contact`, `/team`, `/people` and `/staff` (and below them). Sections whose heading mentions articles, news, blog, testimonials, reviews, privacy, terms, cookies or accessibility are skipped.

| Source | Field(s) | Conditions |
|---|---|---|
| Company name from JSON-LD, or the page title, ending in a legal suffix (LLC, LLP, PLLC, Ltd, Limited, Inc, Incorporated, Corporation, Corp) | `company_foundation/legal_entity_type` | The JSON-LD organization must belong to this site; a title counts only if the suffix appears in its first 120 characters before any sentence end. |
| Up to four exact sentences in which the company ("we", "our firm", or its declared name) provides, offers, designs, builds or serves something | `company_foundation/overview`, `business_model` | Biography, comparison ("many companies...") and instruction ("contact us") sentences are skipped. The services index page can use its introduction under a services heading. |
| "We provide/offer ... services" with the company as subject | `company_foundation/company_role` ("Service provider") | Not on a person profile page; no "if", "would", "unlike" or negation. |
| "We are a ... firm/agency/consultancy/manufacturer/retailer/studio/practice/service provider", and "specializes in / provides ... services" | `company_foundation/industry`, `company_role` | The phrase is copied as written; phrases containing "you", "your", "our", "other" or "another" are skipped. |
| An introductory level-1 heading pair, a heading of 25-400 characters that addresses the reader ("you", "help", "together"...), or a statement such as "you can count on us", "our mission", "we help", "we believe" | `positioning/company_pitch` | Within the first five sections; headings about contact or testimonials are skipped. |
| "Our firm was founded in 1998", "we were established ...", "founded ... in YYYY" with the company as subject | `company_foundation/year_founded`, `positioning/founding_story` | Year between 1000 and the current year; text about a former or sold practice is ignored. |
| "Since 2005, I have run my own practice", "I founded my own firm in ..." | `positioning/founding_story` only | Describes the founder's history, so it never sets the year. |
| A paragraph in a section headed "our story", "firm background" or "company history" with words such as began, started, founded, mission | `positioning/founding_story` | Exact paragraph. |
| "also known as", "trading as", "d/b/a" | `company_foundation/alternative_company_names` | The company must be the subject. |
| "We serve / operate in / work across ..." | `company_foundation/service_locations` | Skipped if the phrase names customer groups such as businesses, clients or individuals. |
| "our founder, Jane Doe" with a same-site profile link and a following sentence about credentials (CPA, member, certified, degree, licence, treasurer, president) | `key_people/@id/name`, `background_or_relevance` | The profile link must be under `/about`, `/team`, `/people` or `/staff` and its text must contain the name. |
| Person profile page body | `key_people/@id/background_or_relevance` (up to three experience paragraphs), `title` (a heading naming a role such as CEO, CPA, founder, owner), `role` (Co-Founder, Founder, Owner, President or Director) | The profile must already have a name from the rules above. |

**Market and customers (`market-text.ts`)**

These rules do not run on blog, article, news, learning-center, privacy or terms pages.

| Source | Field(s) | Conditions |
|---|---|---|
| A list under a heading "Our industries", "Industries we serve", "Sectors" or similar; "worked with ... including: A, B, C" | `market_and_customers/industry_groupings` | Items are kept as written. |
| A list under "Customers", "Clients", "Who we serve" or similar; "Our clients include ...", "We serve ..." | `market_and_customers/target_buyers` | Items are kept as written. |
| Buyer phrases (for example "small businesses", "start-ups", "individuals") in a sentence where the company says it serves, helps, or offers to them | `market_and_customers/target_buyers` | The same sentence must not be negated. Matching spellings are merged and the longest wording is shown. |
| Same passage, when it also holds a sentence about a goal or problem for "you", clients or customers | `market_and_customers/ideal_customer_personas` (buyer type, goals, pain points) | A buyer type alone does not make a persona. "From businesses to those nearing retirement" style ranges are kept as written. |
| Sentences addressed to the customer that describe a problem or benefit (35-500 characters) | `market_and_customers/customer_needs` | At most three, chosen by score; sentences about staff, advertising, cookies or contacting the firm are skipped. |
| A list under "Customer needs", "Client goals" or "Pain points" | `market_and_customers/customer_needs` | Items are kept as written. |
| A list under "Suppliers", "Partners" or "Vendors"; "our suppliers include ..." | `market_and_customers/suppliers_and_partners` | Items are kept as written, with the heading or sentence as the relationship. |
| Links, buttons and form submit buttons whose label begins with an action such as "Get started", "Schedule", "Book", "Contact", "Request", "Sign up", "Subscribe", "Buy", "Call" | `market_and_customers/ctas` | Label is 500 characters or fewer; a button's first line is used. |
| The same action links, plus forms with a submit button that sit under a contact, newsletter or action heading | `market_and_customers/channels` | A form is recorded as an observed entry point; it is never submitted. |

**Design and online presence (`deterministic.ts`, `capture/sections.ts`, `observations.ts`, `colors.ts`)**

| Source | Field(s) | Conditions |
|---|---|---|
| `font-family` declared in `<style>` blocks and `style` attributes, and in stylesheets the renderer loaded | `branding_and_style/fonts` (marked as declared) | Up to 40 style blocks and 200 inline styles are read. Values such as `inherit`, `initial` or `var(...)` are dropped. Not confirmed as brand guidance. |
| `@font-face` rules whose font file the renderer loaded | `branding_and_style/fonts` (declared and loaded) | Renderer only. |
| Computed `font-family` of sampled elements | `branding_and_style/fonts` (computed) | Renderer only. |
| `color` and `background-color` declared in `<style>` blocks and `style` attributes, and computed values from the renderer | `branding_and_style/brand_colors` | Hex, `rgb()`, `rgba()`, `hsl()` and `hsla()` values are normalised to a hex value and alpha; others are skipped. Marked as observed website colours only. |
| `<img>` elements inside a header, navigation, banner or element with a "logo" class or id, whose class, id, alt text or address contains "logo" | `branding_and_style/logos` | Up to 20. Images whose address, class or text contains partner, sponsor, client or favicon (or brandfetch), images inside partner, sponsor, client-logo or customer containers, and hidden images are skipped. Only logos recorded in a header or footer context, or declared in JSON-LD, become a field candidate. |
| Links to `linkedin.com`, `facebook.com`, `instagram.com`, `youtube.com`, `twitter.com`, `x.com`, `tiktok.com` | `online_presence/social_media_links` | The path must not be the site root or a share, intent, sharer or dialog link. LinkedIn must be a `/company/`, `/school/` or `/showcase/` page. Links whose text sits in a section headed partners, sponsors, clients, suppliers, vendors or affiliates are skipped. |

Fields not listed here (for example gender and most other registered fields) have no extraction rule yet. They stay `not_checked` until a person fills them in.

### Other captured content

Page text, headings, forms and other observations that no registered field uses stay attached to the source capture as evidence. They are not presented as extracted business fields.

### Controlled field values

A categorical field may turn an explicit relation into a short label only when one source sentence names the company as its subject and states the current relation. For example, "we provide ... services" or "we offer ... services" can support `Service provider` (`isExplicitServiceProviderSentence` in `source-excerpts.ts`). The exact sentence, its URL and a note about the mapping are kept.

No role is inferred from an offering link, a general industry statement, a third-party mention or a comparison such as "many companies offer this service". This narrow mapping does not allow paraphrasing.

Audience size belongs to buyer fields when the source describes customers. A statement such as "small businesses with 1 to 10 employees" does not set the company's own employee count, which needs an explicit `Employee count:` label. Buyer stage, business type, the scope of one service, company headcount and persona identity are separate concepts, each with its own evidence.

### Source-backed descriptions

When one overview field would lose useful content, a description is built from sentences copied word for word from captured pages (`source-excerpts.ts`).

- Each sentence keeps a citation to its exact source passage.
- Rules choose sentences by page role, headings and whether the company is the subject of the sentence. They drop repeated text and normalise whitespace.
- They do not add linking claims, rewrite prose, infer benefits or turn nearby keywords into sentences.
- When no safe passage exists, the description stays unknown for review.

An offering's description is built the same way from its own detail page. A parent service page can support a sub-service it lists explicitly, but the source's own name and scope are kept. For example, "Gift & Estate Tax Return Preparation" does not support adding "Trust". A service category link shows that a page is a service. It does not establish features listed elsewhere.

### Evidence rules checked after extraction (`validate-candidates.ts`)

- **Founding year:** a founder's statement that they have run "my own accounting practice" since a given year describes the founder's history, not the company's founding year. `year_founded` needs an explicit "founded" or "established" statement or a line reading "Since YYYY". An unrelated copyright date is not evidence of founding.
- **Employee counts:** the raw wording must appear in the cited text, and a stated exact number or range must match it.
- **Legal entity type:** the suffix must appear in the cited text, the JSON-LD name or the page title.
- **Gender:** it needs an explicit self-description such as "I identify as" or a "Gender:" label. It is never inferred from a name, pronouns or images, and no extraction rule currently reads it.
- **Founder biographies:** a biography can support the experience and credentials stated on that page.

The acceptance requirements and the full baseline traceability matrix are in [readable-profile-quality.md](readable-profile-quality.md). The original 45-item case in [extraction-quality.md](extraction-quality.md) is a historical diagnostic only. Its captured customer text is never copied into runtime defaults, templates or generic output.

## 7. Validation, proposals and review

Candidates are validated against their evidence before they are used (`validate-candidates.ts`). Matching candidates are then merged into a single value, and disagreeing ones are kept as a conflict (`reduce.ts`). Each field ends the crawl in one of these coverage states:

| State | Meaning |
|---|---|
| `found` | A supported candidate passed evidence validation. |
| `not_found` | A supported check ran to completion and found no evidence. |
| `not_checked` | The field is unsupported; it needs manual entry or review. |
| `partial` | Capture or parsing was incomplete. |

Missing evidence stays unknown, never guessed. The interface and exports never suggest that every field was found automatically.

Finishing a crawl (`finish_job`) is one protected database transaction:

- **A company with no entries yet:** it receives unreviewed entries once.
- **A company that already has a person's draft:** the crawl only creates review proposals. It never overwrites current values silently.

People can accept, edit or dismiss proposals. They can also enter corrections with their own evidence or leave a field unresolved. Proposals from older versions of the product that hold values not backed by sources stay readable and can be dismissed, but cannot be applied; a fresh crawl replaces them. Publishing is always an explicit human step that creates a permanent snapshot, and saved snapshots never depend on the worker's current state.
