# Deterministic extraction quality benchmark

This benchmark defines what “better” means for source-only extraction. It compares the website captures with the supplied Account-it baseline, but treats that baseline as a set of hypotheses to verify. It is not a target profile to reproduce: claims without captured evidence remain unknown and may not be copied into runtime output.

## Scoring

Score atomic claims, not narrative similarity or word count. A claim is supported only when a captured excerpt directly states it in an applicable context and the proposed field is compatible with that statement. Count a supported claim once even when it appears in several places. A passage composed of multiple factual clauses is split into those claims. A `found` claim with missing, unrelated, or over-broad evidence is unsupported and counts against precision.

For a case with a verified gold set:

- **Supported recall** = gold claims proposed with valid evidence ÷ all gold claims available in the captured pages.
- **Claim precision** = proposed claims with valid evidence ÷ all proposed claims.
- **False-claim count** = proposed claims that add unsupported detail, contradict the source, or claim a certainty the source does not establish.

The Account-it supplied baseline contains 22 narrative claims in its former no-AI result. That count is context only; it is not the recall denominator. Use the explicit, source-verified claims below as the denominator, and report unsupported and unobserved claims separately. Do not inflate recall by counting generated prose, splitting one excerpt into synonyms, or treating the baseline itself as evidence.

Acceptance target for the Account-it capture set: 100% claim precision and zero false claims; at least 90% supported recall over all verified gold items in the claims table; preserve exact evidence and URL for every proposed field; leave all unsupported or unobserved items unresolved with a concrete reason. Rich descriptions should improve coverage through cited source passages, not synthesized prose. The five canonical service pages and three separately evidenced subservices are expected to be identifiable where their own page or a directly relevant page says so. The listed page CTA labels are expected as observations, not as inferred funnels or business intent.

## Account-it evidence case

The case uses the ten successful captures recorded in `/workspace/work/account-it-run/no-ai-sources.json` (retrieved 2026-10-16). The capture file is a local analysis input and is not a product fixture or runtime dependency. Exact quote punctuation and capitalization below follow the captured clean text; ellipses mark omitted surrounding text.

| Claim to assess | Result | Exact evidence and source | Extraction boundary |
|---|---|---|---|
| Account-it Consulting Services, LLC is the named business | Supported | “Welcome To Account-it Consulting Services, LLC” — [home](https://account-it.net/); “Account-it Consulting Services, LLC” in contact heading — [contact](https://account-it.net/contact) | Preserve legal suffix as written. |
| Business provides tax and accounting services | Supported | “professional, timely, and reliable tax and accounting services” — [contact](https://account-it.net/contact) | This supports the explicit service areas, not a quality rating. |
| Boynton Beach, Florida office | Supported | “Our Office / Boynton Beach, Florida 33437” — [contact](https://account-it.net/contact); JSON-LD address also gives Boynton Beach, Florida, 33437 — [home](https://account-it.net/) | Do not imply all services are limited to this address. |
| Doug Cohen is a CPA | Supported | “Doug Cohen, CPA” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | CPA is part of the visible heading. |
| Doug Cohen is the firm's founder | Supported | Metadata description: “Get to know Doug Cohen, the founder of Account-it Consulting Services, LLC…” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Record metadata as metadata evidence; do not fabricate a visible body quote. |
| His practice dates to 2003 | Supported | “since 2003, my own accounting practice in South Florida” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Supports the practice's start year. The page does not literally say “Year Founded: 2003.” |
| He had 14 years as CFO/Controller | Supported | “14 years as a CFO/Controller” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Preserve source's historical wording; do not update the duration based on retrieval date. |
| He offers part-time or interim CFO and accounting support | Supported | “I provide part-time or interim financial and accounting services” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Keep the service associated with the bio and firm. |
| He states 40 years of public accounting and CFO service | Supported | “someone with 40 years of public accounting and CFO service” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Preserve this as source-stated experience; do not reconcile it with the 14-year statement. |
| Nine business/organization groupings are named | Supported | “medical practices, law firms, real estate brokers, property management, internet sales, construction, restaurants, service industry, and homeowners and condo associations” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Nine list items if “homeowners and condo associations” remains one final grouping. Do not invent a narrower SIC industry taxonomy. |
| Doug Cohen is a QuickBooks Certified ProAdvisor | Supported | “As a QuickBooks Certified ProAdvisor” — [Doug Cohen bio](https://account-it.net/about-us/doug-cohen) | Credential applies to the named bio subject. |
| Accounting/bookkeeping is offered | Supported | “Accounting & Bookkeeping” — [accounting page](https://account-it.net/services/accounting-bookkeeping) | Canonical service page. |
| Tax preparation/planning is offered | Supported | “Tax Preparation & Planning” — [tax page](https://account-it.net/services/tax-preparation-planning) | Canonical service page. |
| Payroll is offered | Supported | “Payroll” and “our Florida payroll services” — [payroll page](https://account-it.net/services/payroll) | Canonical service page. |
| IRS tax-problem help is offered | Supported | “We can help you with the following IRS tax problems” — [IRS problems page](https://account-it.net/services/irs-tax-problems) | Canonical service page; individual resolution types require their own excerpt. |
| QuickBooks assistance is offered | Supported | “We provide: QuickBooks setup…” — [QuickBooks page](https://account-it.net/services/quickbooks) | Canonical service page. |
| Tax page explicitly lists individual, business, gift/estate, partnership/corporate, out-of-state, and start-up tax services | Supported | “Individual Tax Preparation / Business Tax Return Preparation / Gift & Estate Tax Return Preparation / Partnership & Corporate Tax Preparation / Estate and Succession Planning / Out-of-State Returns / Business Start-Ups” — [tax page](https://account-it.net/services/tax-preparation-planning) | Preserve these seven source labels. The page does not call the gift/estate return service “Trust Return Preparation.” |
| QuickBooks setup and training are features | Supported | “QuickBooks setup…”; “Training for QuickBooks that helps you and your employees…” — [QuickBooks page](https://account-it.net/services/quickbooks) | Retain separate feature claims with the detail-page URL. |
| QuickAnswers supports employee questions by phone or email | Supported | “We are just a phone call or email away…answer all of your questions” — [QuickBooks page](https://account-it.net/services/quickbooks) | Source calls this “QuickAnswers for your accounting department employees.” |
| QuickTuneup helps with problem areas | Supported | “QuickTuneup is a service that we provide whenever you need help with problem areas” — [QuickBooks page](https://account-it.net/services/quickbooks) | Keep the offer name and stated scope. |
| QuickBooks Tips are available | Supported | “QuickBooks Tips is a collection of shortcuts and hints” — [QuickBooks page](https://account-it.net/services/quickbooks) | A feature/resource, not necessarily a separately sold offering. |
| The site presents “Get started” and “Schedule Appointment” CTAs | Supported | “Get started” — [home](https://account-it.net/) and [Doug Cohen bio](https://account-it.net/about-us/doug-cohen); “Schedule Appointment” — [home](https://account-it.net/) and captured service pages | Preserve observed labels. The source does not prove conversion, a funnel, or successful submission. |
| Contact form presents a Submit control | Supported | “Submit” — [contact](https://account-it.net/contact) | Observed label only; does not prove form delivery or completion. |
| A tax service page says it assists start-ups and established businesses with planning and education | Supported | “We offer tax and education planning to assist start-ups, as well as, established businesses.” — [tax page](https://account-it.net/services/tax-preparation-planning) | Supports these audiences without a headcount. |

### Baseline claims that must not be asserted from these captures

| Baseline claim | Result | Why it stays unresolved |
|---|---|---|
| Buyers include small businesses with 1–10 employees | Unsupported | The pages speak about small businesses but do not state a 1–10 employee range. A range must come from an explicit employee-count statement. |
| Doug Cohen is male | Unsupported | No explicit self-description was found. A name, image, or third-person pronoun is not evidence for the gender field. |
| Doug Cohen is an AICPA member | Unsupported | No AICPA membership statement appears in the ten captured pages. |
| The firm has exactly eight top-level offerings with all baseline-provided feature copy | Unsupported as stated | Five canonical service detail pages are captured. The tax page supplies several distinct service labels, but those must remain distinct from the five pages and may not inherit unrelated baseline feature prose. “Trust” is absent from the tax-return label. |
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

A rich description earns coverage only when its component passages are relevant to the company or offering, verbatim from the cited source, and free of duplicate navigation and unrelated article previews. Preserve exact wording rather than rewriting. For the company overview, prefer a company-level homepage/about passage and an explicitly relevant service overview. For a service description, use the matching detail page. Each assembled passage must keep its own source URL and excerpt; do not attach one broad citation to claims drawn from different pages.

The current homepage alone yields a short promotional/tagline passage and a service link list. The bio and detail pages contain substantially richer source text. A useful extractor should therefore surface cited passages from those pages when they have been captured, while recording a missing page as a capture limitation rather than claiming no service or founder information exists.

## Generalization

Account-it is one real-world evaluation case, not a rule template. Generic acceptance coverage should also include at least two unrelated website fixtures: (1) a company whose employee count is not stated and whose team imagery/names cannot establish gender, and (2) a service business with named detail-page services and explicit features, including unrelated navigation or marketing text that must not leak into those descriptions. A rule passes only if it maps source facts with valid citations and leaves unsupported fields unresolved across these cases. Do not import Account-it names, URLs, values, or prose into application code or generic fixtures.
