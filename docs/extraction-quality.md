# Historical deterministic extraction probe

> **Current acceptance:** The whole-profile, full-baseline requirements in [readable profile quality](readable-profile-quality.md) supersede this file's original percentage and passage-count targets. The 45-item ledger and six-passage check below remain historical diagnostics for the original 10-page Account-it run; they are not completion gates and do not stand in for user-facing completeness, accuracy, or readability. The full baseline matrix now includes source-confirmed facts from linked pages that the original capped run did not select.

This file preserves the original bounded extraction case and its evidence decisions. It compares the website captures with the supplied Account-it baseline, but treats that baseline as hypotheses to verify. It is not a target profile to reproduce: claims without captured evidence remain unknown and may not be copied into runtime output.

## Historical scoring diagnostic

The ledger below lets reviewers quickly check that the earlier 10-page run could extract specific facts with matching evidence. Its 45 items and six cited passage examples are diagnostic only. Do not report their recall, passage count, claim count, or schema validity as whole-profile quality or completion.

For current acceptance, map every baseline assertion to a compatible profile field and exact applicable evidence, or leave it unknown/partial/not checked with a reason. Compare the profile through source-backed user tasks and the complete traceability matrix in [readable profile quality](readable-profile-quality.md). Keep extraction changes separate from new pages selected by the crawler by comparing both the same capture set and the final capture set.

## Account-it evidence case

The historical case uses ten successful HTTP captures in `/workspace/work/extraction-quality/raw/manifest.json` plus the clean text in `/workspace/work/account-it-run/no-ai-sources.json` (retrieved 2026-10-16). The homepage's outside-main meta description and JSON-LD contain a fuller overview than its short visible main text. `/firm-background` was not among those ten captures; one contemporaneous fetch attempt returned HTTP 444, while a later investigation fetched the page successfully. The later page is evidence only for a product run that selects it. These files are local analysis inputs, not product fixtures or runtime dependencies. Exact quote punctuation and capitalization below follow the original captured clean text or raw metadata; ellipses mark omitted surrounding text.

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

### Atomic diagnostic ledger (45 items)

This ledger is the denominator for this historical spot check only, not for release acceptance. An item is one named fact, one scalar value, one list member, one named service label, one named feature, or one observed CTA label. Each item has its own ID so an implementation cannot receive credit for a nine-member list from one generic “nine industries” string. The table's cited excerpt applies to every row in its grouped ID range; for the industry row, the exact nine-item list is quoted above.

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

### Limits of the original 10-page capture (historical)

| Baseline claim | Result | Why it stays unresolved |
|---|---|---|
| Buyers include small businesses with 1–10 employees | Not in original 10-page run; later supported on firm-background | The original pages had no range. The linked `/firm-background` page now explicitly states “typically small businesses with 1 to 10 employees.” It is a buyer attribute, never Account-it employee count. See the full matrix for capture-qualified treatment. |
| Doug Cohen is male | Unsupported | No explicit self-description was found. A name, image, or third-person pronoun is not evidence for the gender field. |
| Doug Cohen is an AICPA member | Not in original 10-page run; later supported on firm-background | The linked `/firm-background` page says Doug is an AICPA member. Do not claim that the older run captured it; use the new source only when its evidence is in the final capture. |
| The firm has exactly eight top-level offerings with all baseline-provided feature copy | Unsupported as a required count or hierarchy | The site has five canonical detail pages, separately named tax-page services, and part-time/interim CFO services. `/firm-background` also lists Estate, Gift & Trust Returns. Preserve each source label and its page hierarchy; do not impose an exact total or copy unsupported feature text. |
| Brand voice is professional, reassuring, and client-focused | Not a directly extractable fact | The site contains reassuring phrases, but the label is an interpretation. A no-AI system may retain exact passages; it cannot synthesize a style diagnosis. |
| The site's art style is a flat gray field with no graphical information | Contradicted by method; not a safe claim | A failed, blank, or incomplete image capture does not describe the website's art direction. Do not emit an inferred style or use a missing screenshot as evidence of absence. |
| The homepage declares a logo | Supported as a structured-data observation | Raw homepage JSON-LD identifies `https://cw3prd.s3.us-west-1.amazonaws.com/2334180/account-logo.png` as `LocalBusiness.logo` (captured logo observation: `selector: jsonld:LocalBusiness/logo`, `alt: Account-it Consulting Services, LLC`). This supports that the site declares this image as its logo; it does not independently verify the image's current appearance or make it a human-confirmed brand asset. |
| A Brandfetch 32-pixel image is the verified site logo | Unsupported | The baseline's separate Brandfetch URL is not the URL declared by the homepage. Its third-party source and tiny size do not establish that it is the current website logo. Keep it as an unconfirmed candidate unless the site itself identifies that image. |
| The listed third-party products are suppliers | Unsupported | Script, analytics, hosting, and directory references do not prove a supplier relationship. No supplier list is stated in these captures. |
| Font Inter and colors #8a8a8a, #202938, #f9fafc are confirmed brand guidelines | Not confirmed | The homepage style capture observes Inter and Lato declarations and CSS colors including `#898989`, `#1F2937`, and `#2E2E2E`. These can be stored as technical observations, not as confirmed brand standards. The baseline's exact color values do not match the captured CSS values. |
| The company is top-rated | Not established | “Your top-rated tax partner” appears as marketing copy; it does not establish a rating, review count, or third-party rank. Preserve it only as a verbatim tagline if that field is available. |
| The firm serves brand-new businesses, businesses nearing retirement, and small businesses with 1–10 employees | Not in original 10-page run; later supported on firm-background | `/firm-background` directly states brand-new through nearing-retirement businesses and typical 1–10 employee small businesses. Keep buyer-size separate from company headcount. |
| Every supplier name and all baseline funnel labels are confirmed | Unsupported | No such list appears in captured source text. Observed form labels and CTAs do not establish the baseline's channel/funnel taxonomy. |

## Description-quality diagnostic

The historical output contained the homepage metadata and excerpts from five service pages. This is a useful spot check that selected text can have evidence, but a fixed passage count cannot establish relevance, completeness, or readability. For current acceptance, overview and service descriptions must follow the source-selection and task-based checks in [readable profile quality](readable-profile-quality.md): relevant exact source sentences, correct company/service context, no navigation dump or duplicated paragraphs, full source access, and a clear distinction between unknown and not captured. The linked `/firm-background` route later returned HTTP 200 from the investigation proxy; its content belongs only to a product run that captures it.

## Generalization

Account-it is one real-world evaluation case, not a rule template. The original 45 items remain a diagnostic subset; they do not qualify whole-baseline or UI behavior. Generic acceptance coverage should also include at least two unrelated website fixtures: (1) a company whose employee count is not stated and whose team imagery/names cannot establish gender, and (2) a service business with named detail-page services and explicit features, including unrelated navigation or marketing text that must not leak into those descriptions. A rule passes only if it maps source facts with valid citations and leaves unsupported fields unresolved across these cases. Do not import Account-it names, URLs, values, or prose into application code or generic fixtures.
