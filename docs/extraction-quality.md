# Deterministic extraction quality benchmark

This benchmark defines what “better” means for source-only extraction. It compares the website captures with the supplied Account-it baseline, but treats that baseline as a set of hypotheses to verify. It is not a target profile to reproduce: claims without captured evidence remain unknown and may not be copied into runtime output.

## Scoring

Score atomic claims, not narrative similarity or word count. A claim is supported only when a captured excerpt directly states it in an applicable context and the proposed field is compatible with that statement. Count a supported claim once even when it appears in several places. A passage composed of multiple factual clauses is split into those claims. A `found` claim with missing, unrelated, or over-broad evidence is unsupported and counts against precision.

For a case with a verified gold set:

- **Supported recall** = gold claims proposed with valid evidence ÷ all gold claims available in the captured pages.
- **Claim precision** = proposed claims with valid evidence ÷ all proposed claims.
- **False-claim count** = proposed claims that add unsupported detail, contradict the source, or claim a certainty the source does not establish.

The prior app output contained 22 provenance claims; that count does not describe the much richer supplied user baseline and is not the recall denominator. Use the fixed atomic ledger below, and report unsupported and unobserved baseline claims separately. Do not inflate recall by counting generated prose or synonyms, and do not collapse a multi-item list into one hit. Each ledger ID counts once; a single field or passage can satisfy several IDs only when it explicitly supports each one.

Acceptance target for the Account-it capture set: 100% claim precision and zero false claims; at least 90% supported recall over the 45 atomic gold items below; preserve exact evidence and URL for every proposed field; leave all unsupported or unobserved items unresolved with a concrete reason. Rich descriptions should improve coverage through cited source passages, not synthesized prose. The five index-level service pages, the seven separately named tax-page service types, and the separately described part-time/interim CFO service are tested as their own source labels; there is no fixed total offering count because the source presents different levels of service hierarchy. The four CTA labels are expected as observations, not as inferred funnels or business intent.

## Account-it evidence case

The case uses ten successful HTTP captures in `/workspace/work/extraction-quality/raw/manifest.json` plus the clean text in `/workspace/work/account-it-run/no-ai-sources.json` (retrieved 2026-10-16). The homepage's outside-main meta description and JSON-LD contain a fuller overview than its short visible main text. The homepage links to `/firm-background`, but that page is not among the ten captures; a separate fetch returned HTTP 444 with an empty body, so it adds no evidence to this benchmark. These files are local analysis inputs, not product fixtures or runtime dependencies. Exact quote punctuation and capitalization below follow the captured clean text or raw metadata; ellipses mark omitted surrounding text.

| Claim to assess | Result | Exact evidence and source | Extraction boundary |
|---|---|---|---|
| Account-it Consulting Services, LLC is the named business | Supported | “Welcome To Account-it Consulting Services, LLC” — [home](https://account-it.net/); “Account-it Consulting Services, LLC” in contact heading — [contact](https://account-it.net/contact) | Preserve legal suffix as written. |
| Business provides tax and accounting services | Supported | “professional, timely, and reliable tax and accounting services” — [contact](https://account-it.net/contact) | This supports the explicit service areas, not a quality rating. |
| Homepage states an overview about its service and customer focus | Supported | Meta description and JSON-LD `description`: “Account-it Consulting Services, LLC will take care of your tax preparation and planning needs so you can focus on life in beautiful Boynton Beach.” — [home](https://account-it.net/) | This is outside the visible main text. It supports an exact cited overview passage and its separate atoms in the ledger; it does not support synthesized copy. |
| Boynton Beach, Florida office | Supported | “Our Office / Boynton Beach, Florida 33437” — [contact](https://account-it.net/contact); JSON-LD address also gives Boynton Beach, Florida, 33437 — [home](https://account-it.net/) | Do not imply all services are limited to this address. |
| Doug Cohen is a CPA | Supported | “Doug Cohen, CPA” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | CPA is part of the visible heading. |
| Doug Cohen is the firm's founder | Supported | Metadata description: “Get to know Doug Cohen, the founder of Account-it Consulting Services, LLC…” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Record metadata as metadata evidence; do not fabricate a visible body quote. |
| His practice dates to 2003 | Supported | “since 2003, my own accounting practice in South Florida” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Supports the practice's start year. The page does not literally say “Year Founded: 2003.” |
| He had 14 years as CFO/Controller | Supported | “14 years as a CFO/Controller” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Preserve source's historical wording; do not update the duration based on retrieval date. |
| He offers part-time or interim CFO and accounting support | Supported | “I provide part-time or interim financial and accounting services” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Keep the service associated with the bio and firm. |
| He states 40 years of public accounting and CFO service | Supported | “someone with 40 years of public accounting and CFO service” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Preserve this as source-stated experience; do not reconcile it with the 14-year statement. |
| Nine business/organization groupings are named | Supported | “medical practices, law firms, real estate brokers, property management, internet sales, construction, restaurants, service industry, and homeowners and condo associations” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Each comma-delimited list item is scored separately; the source's final “homeowners and condo associations” phrase is one item. The total-nine statement is not one gold item. |
| Doug Cohen is a QuickBooks Certified ProAdvisor | Supported | “As a QuickBooks Certified ProAdvisor” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Credential applies to the named bio subject. |
| Accounting/bookkeeping is offered | Supported | “Accounting & Bookkeeping” — [accounting page](https://account-it.net/services/accounting-bookkeeping) | Canonical service page. |
| Tax preparation/planning is offered | Supported | “Tax Preparation & Planning” — [tax page](https://account-it.net/services/tax-preparation-planning) | Canonical service page. |
| Payroll is offered | Supported | “Payroll” and “our Florida payroll services” — [payroll page](https://account-it.net/services/payroll) | Canonical service page. |
| IRS tax-problem help is offered | Supported | “We can help you with the following IRS tax problems” — [IRS problems page](https://account-it.net/services/irs-tax-problems) | Canonical service page; individual resolution types require their own excerpt. |
| QuickBooks assistance is offered | Supported | “We provide: QuickBooks setup…” — [QuickBooks page](https://account-it.net/services/quickbooks) | Canonical service page. |
| Tax page explicitly lists seven return/planning service types | Supported | “Individual Tax Preparation / Business Tax Return Preparation / Gift & Estate Tax Return Preparation / Partnership & Corporate Tax Preparation / Estate and Succession Planning / Out-of-State Returns / Business Start-Ups” — [tax page](https://account-it.net/services/tax-preparation-planning) | Each of the seven labels is a separate ledger item. Preserve the source's hierarchy and labels. The page does not call the gift/estate return service “Trust Return Preparation.” |
| QuickBooks setup and training are features | Supported | “QuickBooks setup…”; “Training for QuickBooks that helps you and your employees…” — [QuickBooks page](https://account-it.net/services/quickbooks) | Retain separate feature claims with the detail-page URL. |
| QuickAnswers supports employee questions by phone or email | Supported | “We are just a phone call or email away…answer all of your questions” — [QuickBooks page](https://account-it.net/services/quickbooks) | Source calls this “QuickAnswers for your accounting department employees.” |
| QuickTuneup helps with problem areas | Supported | “QuickTuneup is a service that we provide whenever you need help with problem areas” — [QuickBooks page](https://account-it.net/services/quickbooks) | Keep the offer name and stated scope. |
| QuickBooks Tips are available | Supported | “QuickBooks Tips is a collection of shortcuts and hints” — [QuickBooks page](https://account-it.net/services/quickbooks) | A feature/resource, not necessarily a separately sold offering. |
| The site presents “Get started” and “Schedule Appointment” CTAs | Supported | “Get started” — [home](https://account-it.net/) and [Doug Cohen bio](https://account-it.net/about-us/doug-cohen); “Schedule Appointment” — [home](https://account-it.net/) and captured service pages | Preserve observed labels. The source does not prove conversion, a funnel, or successful submission. |
| Contact form presents a Submit control | Supported | “Submit” — [contact](https://account-it.net/contact) | Observed label only; does not prove form delivery or completion. |
| A tax service page says it assists start-ups and established businesses with planning and education | Supported | “We offer tax and education planning to assist start-ups, as well as, established businesses.” — [tax page](https://account-it.net/services/tax-preparation-planning) | Supports these audiences without a headcount. |

### Atomic gold ledger (45 items)

This ledger is the scoring denominator. An item is one named fact, one scalar value, one list member, one named service label, one named feature, or one observed CTA label. Each item has its own ID so an implementation cannot receive credit for a nine-member list from one generic “nine industries” string. The table's cited excerpt applies to every row in its grouped ID range; for the industry row, the exact nine-item list is quoted above.

| ID | Atomic expected fact | Evidence |
|---|---|---|
| AC-01 | Business name: Account-it Consulting Services, LLC | Homepage visible text and contact heading: [home](https://account-it.net/), [contact](https://account-it.net/contact). |
| AC-02 | Primary tax preparation/planning service need is stated | Homepage meta description and JSON-LD description: [home](https://account-it.net/). |
| AC-03 | The stated purpose is to let customers “focus on life” | Same homepage description; keep as source wording, not a verified outcome: [home](https://account-it.net/). |
| AC-04 | City: Boynton Beach | Contact page and homepage JSON-LD: [contact](https://account-it.net/contact), [home](https://account-it.net/). |
| AC-05 | State: Florida | Contact page and homepage JSON-LD: [contact](https://account-it.net/contact), [home](https://account-it.net/). |
| AC-06 | ZIP code: 33437 | Contact page and homepage JSON-LD: [contact](https://account-it.net/contact), [home](https://account-it.net/). |
| AC-07 | Person name: Doug Cohen | Bio heading: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-08 | CPA credential | Bio heading “Doug Cohen, CPA”: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-09 | Founder relation to Account-it Consulting Services, LLC | Bio title/metadata description: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-10 | Own accounting practice began in 2003 | “since 2003, my own accounting practice in South Florida”: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-11 | Fourteen years as CFO/Controller (source-stated duration) | “14 years as a CFO/Controller”: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-12 | Forty years of public-accounting/CFO service (source-stated duration) | “40 years of public accounting and CFO service”: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-13 | Part-time CFO service | “part-time CFO”: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-14 | Interim financial/accounting service | “part-time or interim financial and accounting services”: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-15 | QuickBooks Certified ProAdvisor credential | [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-16 | Medical practices | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-17 | Law firms | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-18 | Real estate brokers | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-19 | Property management | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-20 | Internet sales | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-21 | Construction | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-22 | Restaurants | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-23 | Service industry | Industry list: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-24 | Homeowners and condo associations | Industry list; one final source list item: [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-25 | Accounting & Bookkeeping page/service | [Accounting detail page](https://account-it.net/services/accounting-bookkeeping). |
| AC-26 | Tax Preparation & Planning page/service | [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-27 | Payroll page/service | [Payroll detail page](https://account-it.net/services/payroll). |
| AC-28 | IRS Tax Problems page/service | [IRS detail page](https://account-it.net/services/irs-tax-problems). |
| AC-29 | QuickBooks page/service | [QuickBooks detail page](https://account-it.net/services/quickbooks). |
| AC-30 | Individual Tax Preparation | Tax page service list: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-31 | Business Tax Return Preparation | Tax page service list: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-32 | Gift & Estate Tax Return Preparation | Tax page service list; “Trust” is not supported: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-33 | Partnership & Corporate Tax Preparation | Tax page service list: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-34 | Estate and Succession Planning | Tax page service list: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-35 | Out-of-State Returns | Tax page service list: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-36 | Business Start-Ups | Tax page service list: [Tax detail page](https://account-it.net/services/tax-preparation-planning). |
| AC-37 | QuickBooks setup | QuickBooks detail page “We provide” list: [QuickBooks detail page](https://account-it.net/services/quickbooks). |
| AC-38 | QuickBooks training | QuickBooks detail page “We provide” list: [QuickBooks detail page](https://account-it.net/services/quickbooks). |
| AC-39 | QuickAnswers | QuickBooks detail page “We provide” list: [QuickBooks detail page](https://account-it.net/services/quickbooks). |
| AC-40 | QuickTuneup | QuickBooks detail page “We provide” list: [QuickBooks detail page](https://account-it.net/services/quickbooks). |
| AC-41 | QuickBooks Tips | QuickBooks detail page “We provide” list: [QuickBooks detail page](https://account-it.net/services/quickbooks). |
| AC-42 | “Get started” CTA observed | Homepage and Doug Cohen bio: [home](https://account-it.net/), [Doug Cohen bio](https://account-it.net/about-us/doug-cohen). |
| AC-43 | “Schedule Appointment” CTA observed | Homepage and captured service pages: [home](https://account-it.net/). |
| AC-44 | “Notify me” CTA observed | [Home](https://account-it.net/). |
| AC-45 | “Submit” CTA observed | [Contact form](https://account-it.net/contact). |

For descriptive passage quality, score separately from the 45 claim recall: the exact homepage meta/JSON-LD overview is one eligible source passage, and each proposed offering feature description must be a verbatim excerpt from its matching detail page with its own citation. Passage score is valid-cited relevant passages proposed ÷ all eligible captured passages used by the benchmark; report it separately so it cannot inflate atomic claim recall.

### Baseline claims that must not be asserted from these captures

| Baseline claim | Result | Why it stays unresolved |
|---|---|---|
| Buyers include small businesses with 1–10 employees | Unsupported | The pages speak about small businesses but do not state a 1–10 employee range. A range must come from an explicit employee-count statement. |
| Doug Cohen is male | Unsupported | No explicit self-description was found. A name, image, or third-person pronoun is not evidence for the gender field. |
| Doug Cohen is an AICPA member | Unsupported | No AICPA membership statement appears in the ten captured pages. |
| The firm has exactly eight top-level offerings with all baseline-provided feature copy | Unsupported as a required count or hierarchy | The captured site index has five top-level service pages. The tax detail page lists seven service types beneath its page, and the founder bio describes part-time/interim CFO work. Preserve these explicit labels and their source/page relationships; do not impose an exact total of eight or copy unsupported baseline features. The source says “Gift & Estate Tax Return Preparation,” not Trust returns. |
| Brand voice is professional, reassuring, and client-focused | Not a directly extractable fact | The site contains reassuring phrases, but the label is an interpretation. A no-AI system may retain exact passages; it cannot synthesize a style diagnosis. |
| The site's art style is a flat gray field with no graphical information | Contradicted by method; not a safe claim | A failed, blank, or incomplete image capture does not describe the website's art direction. Do not emit an inferred style or use a missing screenshot as evidence of absence. |
| The homepage declares a logo | Supported as a structured-data observation | Raw homepage JSON-LD identifies `https://cw3prd.s3.us-west-1.amazonaws.com/2334180/account-logo.png` as `LocalBusiness.logo` (captured logo observation: `selector: jsonld:LocalBusiness/logo`, `alt: Account-it Consulting Services, LLC`). This supports that the site declares this image as its logo; it does not independently verify the image's current appearance or make it a human-confirmed brand asset. |
| A Brandfetch 32-pixel image is the verified site logo | Unsupported | The baseline's separate Brandfetch URL is not the URL declared by the homepage. Its third-party source and tiny size do not establish that it is the current website logo. Keep it as an unconfirmed candidate unless the site itself identifies that image. |
| The listed third-party products are suppliers | Unsupported | Script, analytics, hosting, and directory references do not prove a supplier relationship. No supplier list is stated in these captures. |
| Font Inter and colors #8a8a8a, #202938, #f9fafc are confirmed brand guidelines | Not confirmed | The homepage style capture observes Inter and Lato declarations and CSS colors including `#898989`, `#1F2937`, and `#2E2E2E`. These can be stored as technical observations, not as confirmed brand standards. The baseline's exact color values do not match the captured CSS values. |
| The company is top-rated | Not established | “Your top-rated tax partner” appears as marketing copy; it does not establish a rating, review count, or third-party rank. Preserve it only as a verbatim tagline if that field is available. |
| The firm serves brand-new businesses, businesses nearing retirement, and every other buyer segment listed in the baseline | Partially supported | Start-ups, established businesses, and small businesses occur in relevant service copy. The specific “nearing retirement” and 1–10 employee segments are absent. Never broaden an observed phrase to the entire baseline persona. |
| Every supplier name and all baseline funnel labels are confirmed | Unsupported | No such list appears in captured source text. Observed form labels and CTAs do not establish the baseline's channel/funnel taxonomy. |

## Description quality

A rich description earns coverage only when its component passages are relevant to the company or offering, verbatim from the cited source, and free of duplicate navigation and unrelated article previews. Preserve exact wording rather than rewriting. For the company overview, use the captured homepage meta/JSON-LD description as one target passage. For service descriptions, use excerpts from the matching captured detail page. Each passage must keep its own source URL and exact excerpt; do not attach one broad citation to claims drawn from different pages.

Description acceptance target is at least six distinct cited passages: the exact homepage overview plus at least one relevant, verbatim description excerpt from each of the five captured service detail pages (accounting/bookkeeping, tax preparation/planning, payroll, IRS tax problems, QuickBooks). This passage target is separate from the 45 atomic claims and cannot inflate their recall. The bio and service pages contain richer text that can support additional passages, but the benchmark does not require copying every source paragraph. The `/firm-background` link is observed but its target was not captured: the attempted fetch returned HTTP 444 with an empty body, so unknown content there is a capture limitation, not evidence of absence.

## Generalization

Account-it is one real-world evaluation case, not a rule template. Generic acceptance coverage should also include at least two unrelated website fixtures: (1) a company whose employee count is not stated and whose team imagery/names cannot establish gender, and (2) a service business with named detail-page services and explicit features, including unrelated navigation or marketing text that must not leak into those descriptions. A rule passes only if it maps source facts with valid citations and leaves unsupported fields unresolved across these cases. Do not import Account-it names, URLs, values, or prose into application code or generic fixtures.
