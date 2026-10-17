# MoFloKnowledge implementation Quests

Canonical source: `docs/quests.json`. Plan base `3a49d44e8b31a907ce9ef7f3f3f09f55f527ab55`; branch `chore/moflo-quest-plan`. All implementation and verification below is **planned, not performed**. Author: GPT-6.1 Sol.

Usually 15–40 minutes, 1–4 finite acceptance criteria, one smallest useful logical concern; estimates are not measured cost promises.

## Execution and planning boundaries

- mode: direct_without_guild
- docker_required: False
- planning_only: True
- authorized_deliverables: ['docs/quests.json', 'docs/quests.md']
- authority_rule: This planning artifact grants no additional authority and does not revoke or require renewed permission for existing explicit user authorizations/delegations. This task performs only the two planning deliverables.
- verification_prefix: Source /workspace/guild-runtime/activate.sh for non-login shells; prefix tool commands with PATH=/workspace/guild-runtime/bin:$PATH.
- future_commands: All quest verification entries are planned checks, not results. Use package scripts after their owning quest exists; live setup and exact host evidence are separate gates.
- phase_policy: Preserve source incremental usable outcomes. Implement/review one phase outcome at a time; dependency edges represent actual consumed artifacts/contracts/accepted gates, not source order. Local work may prepare independent later-phase modules without claiming that phase accepted.
- test_policy: No Docker/Guild Trials dependency. Disposable native/managed PostgreSQL and qualified native host networking; controlled fixture egress never weakens production policy. One serialized browser runner; no browser installation.

## Counts and entry-ready work

| Phase | Outcome | Quests | Ranks |
| --- | --- | ---: | --- |
| 0 | Establish contracts and runtime | 23 | C=1, D=18, E=4 |
| 1 | Company isolation and a manual end-to-end path | 23 | C=7, D=16 |
| 2 | Durable bounded scraping | 25 | C=9, D=16 |
| 3 | Complete extraction and provenance | 23 | C=2, D=19, E=2 |
| 4 | Review, corrections and re-scraping | 14 | C=1, D=13 |
| 5 | Version management and release acceptance | 16 | C=2, D=14 |

Total: 124. Entry-ready at this base: Q001, Q003, Q018. Dependency edges: 295; longest chain: 27 quests. Largest same-depth antichain: 14 (not a host concurrency recommendation).

The Phase 1 manual-path acceptance quest has no Phase 2–5 ancestor. Its complete dependency closure can produce a useful create/save/approve/publish/download path before crawling/model readiness.

## Assumptions

- Planning only: base has README.md and docs/implementation-plan.md; module paths are proposed exact ownership boundaries, not existing implementation.
- The user explicitly selects direct execution without Guild/Docker dependency for this run. Host-native isolation must satisfy the source security requirements; this is a deployment-process adaptation, not an egress waiver.
- No hosting vendor, model ID, credential, Auth method, rate/token ceiling not fixed in source or deployment resource value is invented. Owner choices are setup gates.
- Node22 and patched supported Next15 remain source targets. If vendor support is unsuitable at implementation time, resolve the concrete runtime decision before launch.
- All implementation size/model recommendations are estimates; no measured token/cost or passing application test is claimed.
- Use native forms, straightforward functions/SQL and existing PostgreSQL scrape_jobs; no generic form engine, new queue, state framework, search index or recurring service proliferation.
- Before future implementation, inspect current repository instructions/status and reconcile source changes. This artifact grants no additional authority; existing explicit user authorizations and delegated publication/merge authority persist. No implementation, commit or external change is performed by this planning task.
- Future browser/port-bound checks use one configured exclusive wrapper with a wall-clock cap, no browser installation; exact process IDs only and test-owned disposable resources.
- No registered author email is configured by this planning artifact. Establish real commit identity only when commits become authorized; this does not block reading or planning.

## Setup gates

### provider_configuration

Status: **unresolved_owner_configuration**. Required before: Live Auth/database/model access and deployment. Quests: Q003, Q037, Q120.

- Supabase project/region/exact PostgreSQL version/extensions and migration-owner/worker role provisioning
- Auth method, application/redirect URLs and provider/email setup only as needed
- Database TLS, direct/pooler limits, backup policy and data processing terms

Local work: Contract/default/fixture and offline implementation tasks

### runtime_model_compatibility

Status: **unresolved_live_qualification**. Required before: Accepting crawl runtime and release extraction capability. Quests: Q001, Q023, Q122.

- Patched supported Next15/Node22 and compatible package versions
- Configured strict-output model with explicit token/time ceilings; real API schema support

Local work: Recorded-output extraction and deterministic semantic tests

### non_docker_host_qualification

Status: **unresolved_host_selection_and_evidence**. Required before: Any arbitrary company URL execution; production release. Quests: Q004, Q058, Q071.

- Owner-selected host-native persistent services and authenticated private renderer channel
- Actual enforced proxy/firewall, direct TCP/UDP/QUIC/DNS denial, sandbox/resources/restart capabilities

Local work: Pure URL/DNS logic, controlled isolated fixtures and contract work; fixture allowlist is test-only

### production_deployment

Status: **unresolved_owner_configuration**. Required before: Release. Quests: Q120, Q121, Q124.

- Provider-native supervisor/process policy and resource values
- Secret management injection and restricted application/database/model egress
- Managed backup enablement/restore evidence and minimal operator health visibility

Local work: Deterministic tests and local reviewable application changes

## Deferred after MVP

- Billing, chatbots and vector search: Explicit MVP exclusions (source L15–15).
- Independent external enrichment/market research: Website-only fact boundary; later work needs separate origins (source L15–15).
- Scheduled/periodic crawling and expanded sitemap crawling: Explicitly later; bounded user-requested crawl is sufficient (source L15–15).
- PDF extraction, asset archive and custom ordering: Explicitly later; basic browser/style observations remain mandatory (source L15–15).
- Concurrent collaborative editing and automatic merge/matching engine: Expected revisions and manual candidate decisions are MVP behavior (source L15–15).
- Member invitations/email delivery and advanced proposal matching: Existing registered UUID membership and bounded comparison are sufficient (source L1484–1484).
- Supabase Realtime, CPU parsing threads and broad JSON indexes: Optional only after demonstrated need; polling/asynchronous I/O/current indexes suffice (source L74–74).
- Approve all: Optional convenience, not required for manual review (source L198–198).
- Physical company/account deletion, retention/erasure workflow and export conversion: MVP archives companies/preserves authors and old schema snapshots; separate legal/product work required (source L17–17).
- Public website publishing or public knowledge endpoint: Snapshot publication is private to members (source L17–17).

## Independent lanes

- **Shared contracts**: Q005, Q006, Q007, Q008, Q009, Q010, Q011, Q012, Q013, Q014, Q015. After primitive schemas, independent category schema files run concurrently; registry joins their contracts.
- **Relational foundations and auth**: Q018, Q019, Q020, Q021, Q024, Q025, Q026, Q031, Q037, Q038. Independent table migrations and app/Auth work can progress beside contract work; DB fixtures require all baseline tables.
- **Manual Phase 1 path**: Q027, Q028, Q029, Q030, Q032, Q033, Q034, Q035, Q036, Q039, Q040, Q041, Q042, Q043, Q044, Q045, Q046. Completes useful create/save/approve/publish/download without crawl/model/renderer implementation or later phases.
- **Host security and transport**: Q004, Q023, Q052, Q053, Q054, Q055, Q056, Q057, Q058, Q071. Network modules and gate probes are separate from queue SQL; host enforcement must be accepted before arbitrary URL execution.
- **Durable jobs**: Q047, Q048, Q049, Q050, Q051, Q064, Q068. After lease foundation, checkpoint/source insertion are file-disjoint. Scrape status API does not wait for extraction implementation.
- **Capture and orchestration**: Q059, Q060, Q061, Q062, Q063, Q065, Q066, Q067, Q069, Q070. HTML parsing and frontier/robots work are separately testable; run coordinator joins qualified transport and restricted DB behavior.
- **Extraction rules**: Q072, Q073, Q074, Q075, Q076, Q077, Q078, Q079, Q080, Q081, Q082, Q083, Q084, Q085, Q086, Q094. Rule modules after semantic candidate interface are file-disjoint; reduction/ingestion join them without adding source-order edges.
- **Forms and review**: Q087, Q088, Q089, Q090, Q091, Q092, Q093, Q095, Q096, Q097, Q098, Q099, Q100, Q101, Q102, Q103, Q104, Q107, Q108. Category forms can be built before model completion; history/proposal SQL and APA formatting run independently when inputs exist.
- **Citation UI**: Q105, Q106, Q107. Formatter and accessible popover can progress beside extraction; final leaf wiring consumes complete editor/review state.
- **Version and owner management**: Q109, Q110, Q111, Q112, Q113, Q114, Q115, Q116, Q117, Q118, Q119. Owner SQL and snapshot hardening are disjoint; version-viewer integrations reserve a single writer each.
- **Release qualification**: Q120, Q121, Q122, Q123, Q124. Provider setup and live model evidence are separate from deterministic E2E/concurrency evidence; no external publication is authorized by this plan.

## Shared file reservations

Never dispatch two quests writing the same path concurrently. All overlaps below consume predecessor contents and are serialized by dependencies; independent quests otherwise own distinct files.

- `src/app/sign-in/page.tsx`: Q022 → Q037.

- `src/components/company-dashboard.tsx`: Q042 → Q113.

- `src/components/knowledge/category-editor.tsx`: Q093 → Q097 → Q104 → Q107.

- `src/components/knowledge/manual-editor.tsx`: Q044 → Q045 → Q069 → Q093.

- `src/components/knowledge/review-actions.tsx`: Q097 → Q100.

- `src/components/versions/publish-panel.tsx`: Q045 → Q118.

- `src/components/versions/version-viewer.tsx`: Q115 → Q116 → Q117.

- `src/worker/crawl/run-crawl.ts`: Q066 → Q086.

## Quest index

| ID | Phase | Title | Rank / min | Dependencies |
| --- | ---: | --- | --- | --- |
| Q001 | 0 | Pin the application toolchain and package scripts | D / 30 | Entry-ready |
| Q002 | 0 | Set up deterministic test runners | D / 30 | Q001 |
| Q003 | 0 | Record provider and authentication setup gates | E / 20 | Entry-ready |
| Q004 | 0 | Specify a qualified non-Docker renderer boundary | D / 30 | Q003 |
| Q005 | 0 | Define primitive and reusable value schemas | D / 35 | Q001 |
| Q006 | 0 | Define employee and pricing normalization | D / 30 | Q005 |
| Q007 | 0 | Define Company Foundation contract | D / 25 | Q006 |
| Q008 | 0 | Define Positioning contract | E / 20 | Q005 |
| Q009 | 0 | Define Market and Customers contract | D / 25 | Q005 |
| Q010 | 0 | Define Branding and Online Presence contracts | E / 20 | Q005 |
| Q011 | 0 | Define Person and Offering entry contracts | D / 25 | Q006 |
| Q012 | 0 | Define evidence, claim and proposal envelopes | D / 35 | Q007, Q008, Q009, Q010, Q011 |
| Q013 | 0 | Assemble the complete field registry and defaults | D / 30 | Q012 |
| Q014 | 0 | Resolve stable provenance paths | D / 30 | Q013 |
| Q015 | 0 | Validate compatible claims and complete coverage | C / 40 | Q014 |
| Q016 | 0 | Create the controlled company website fixture | D / 30 | Q001 |
| Q017 | 0 | Record structured extraction fixtures | D / 25 | Q013, Q016 |
| Q018 | 0 | Prepare company and membership schema | D / 30 | Entry-ready |
| Q019 | 0 | Prepare job and source schema | D / 30 | Q018 |
| Q020 | 0 | Prepare entry and revision schema | D / 25 | Q018 |
| Q021 | 0 | Prepare snapshot schema | E / 20 | Q018 |
| Q022 | 0 | Build the branded sign-in and app shell | D / 30 | Q001, Q013 |
| Q023 | 0 | Qualify configured runtime capabilities with a small sample | D / 25 | Q001, Q003, Q004 |
| Q024 | 1 | Apply migrations only to a disposable test database | D / 30 | Q002, Q018, Q019, Q020, Q021 |
| Q025 | 1 | Enforce membership reads and default-deny writes | C / 40 | Q024 |
| Q026 | 1 | Reject mutation of historical rows | D / 30 | Q024 |
| Q027 | 1 | Generate SQL contract/default parity artifacts | D / 30 | Q013 |
| Q028 | 1 | Validate strict saved JSON in protected SQL | C / 40 | Q025, Q027, Q015 |
| Q029 | 1 | Enforce claim origin and support semantics in SQL | C / 40 | Q028, Q015 |
| Q030 | 1 | Validate frozen source evidence in protected SQL | C / 40 | Q029, Q019 |
| Q031 | 1 | Create company and first owner atomically | D / 30 | Q025 |
| Q032 | 1 | Create an entry identity and first revision atomically | D / 35 | Q030, Q026 |
| Q033 | 1 | Save immutable revisions of existing entries | C / 40 | Q030, Q026 |
| Q034 | 1 | Assemble approved snapshot values in shared code | D / 35 | Q015 |
| Q035 | 1 | Assemble and validate snapshot payloads in SQL | C / 40 | Q030, Q034, Q027 |
| Q036 | 1 | Publish snapshots atomically under generation checks | C / 40 | Q035, Q033 |
| Q037 | 1 | Wire verified Supabase sessions | D / 35 | Q001, Q003, Q022 |
| Q038 | 1 | Implement shared safe route boundaries | D / 30 | Q037, Q005 |
| Q039 | 1 | Expose company creation and scoped listing | D / 25 | Q038, Q031 |
| Q040 | 1 | Expose company-qualified draft and save routes | D / 30 | Q038, Q033, Q032 |
| Q041 | 1 | Expose preview, publication and saved JSON download | D / 35 | Q038, Q036, Q034 |
| Q042 | 1 | Build dashboard and company switching | D / 30 | Q039, Q037 |
| Q043 | 1 | Create company-scoped draft state | D / 30 | Q040, Q013 |
| Q044 | 1 | Deliver the manual foundation entry path | D / 35 | Q043, Q042, Q015 |
| Q045 | 1 | Deliver manual preview and saved download | D / 25 | Q041, Q044 |
| Q046 | 1 | Prove the two-tenant manual lifecycle | D / 35 | Q045, Q026, Q025, Q030 |
| Q047 | 2 | Enqueue and cancel company jobs atomically | D / 35 | Q025, Q031, Q012 |
| Q048 | 2 | Claim and reclaim jobs with lease fencing | C / 40 | Q047 |
| Q049 | 2 | Persist fenced job checkpoints and failure state | D / 30 | Q048, Q012 |
| Q050 | 2 | Insert finalized captures once | D / 30 | Q048, Q030, Q026 |
| Q051 | 2 | Finalize proposals and first import atomically | C / 40 | Q049, Q050, Q033, Q032 |
| Q052 | 2 | Normalize URLs and constrain document scope | D / 30 | Q005 |
| Q053 | 2 | Reject non-global DNS destinations | C / 35 | Q001, Q052 |
| Q054 | 2 | Connect only to approved IP addresses | C / 40 | Q053, Q052 |
| Q055 | 2 | Implement the enforced destination proxy | C / 40 | Q054, Q004 |
| Q056 | 2 | Create the private renderer task interface | D / 35 | Q055, Q012, Q004 |
| Q057 | 2 | Restrict browser navigation and resource loading | C / 40 | Q056, Q052 |
| Q058 | 2 | Qualify host-enforced renderer egress before arbitrary URLs | D / 30 | Q057, Q004, Q003, Q023 |
| Q059 | 2 | Honor robots and bounded retry policy | D / 30 | Q054 |
| Q060 | 2 | Prioritize and deduplicate the finite crawl frontier | D / 30 | Q052, Q012 |
| Q061 | 2 | Reserve crawl budgets before dispatch | C / 40 | Q060, Q059 |
| Q062 | 2 | Extract sanitized text and observed metadata | D / 35 | Q012, Q052, Q016 |
| Q063 | 2 | Capture rendered text and raw style observations | D / 35 | Q057, Q062, Q061 |
| Q064 | 2 | Wrap restricted job SQL operations | D / 25 | Q051, Q049, Q050, Q003 |
| Q065 | 2 | Build a source-backed foundation proposal without AI | D / 30 | Q062, Q015, Q013 |
| Q066 | 2 | Coordinate one durable bounded crawl | C / 40 | Q064, Q061, Q063, Q065, Q058 |
| Q067 | 2 | Run the persistent worker lifecycle | D / 30 | Q066 |
| Q068 | 2 | Expose enqueue, status and cancellation routes | D / 30 | Q038, Q047, Q012 |
| Q069 | 2 | Show persisted progress and refresh recovery | D / 30 | Q068, Q045 |
| Q070 | 2 | Prove lease recovery, cancellation and access loss | D / 35 | Q067, Q068, Q024, Q002 |
| Q071 | 2 | Prove transport and browser escape denials | C / 40 | Q058, Q063, Q002 |
| Q072 | 3 | Call strict Structured Outputs one page at a time | D / 35 | Q017, Q012, Q003, Q064 |
| Q073 | 3 | Validate candidate evidence before reduction | C / 40 | Q072, Q015, Q062, Q050 |
| Q074 | 3 | Attempt all Foundation and Positioning fields | D / 30 | Q073, Q006 |
| Q075 | 3 | Attempt audience, persona and outlook fields | D / 25 | Q073 |
| Q076 | 3 | Extract visible channels, funnels, CTAs and partners | D / 25 | Q073 |
| Q077 | 3 | Normalize font observations without inventing usage | D / 25 | Q063, Q073 |
| Q078 | 3 | Normalize observed colors and apparent roles | D / 25 | Q063, Q073 |
| Q079 | 3 | Identify company logos and official social profiles | D / 25 | Q063, Q073 |
| Q080 | 3 | Extract labeled writing and art interpretations | D / 20 | Q073, Q063 |
| Q081 | 3 | Extract relevant public people conservatively | D / 25 | Q073 |
| Q082 | 3 | Extract offering-specific features and pricing | D / 30 | Q073, Q006 |
| Q083 | 3 | Compute all required field assessments honestly | D / 30 | Q013, Q073 |
| Q084 | 3 | Reduce candidates without silent selection | D / 30 | Q073, Q083 |
| Q085 | 3 | Enforce strict proposal ingestion and frozen candidates | C / 40 | Q051, Q030, Q084 |
| Q086 | 3 | Wire complete extraction into durable jobs | D / 35 | Q074, Q075, Q076, Q077, Q078, Q079, Q080, Q081, Q082, Q085, Q066 |
| Q087 | 3 | Add native positioning controls | E / 20 | Q043, Q008 |
| Q088 | 3 | Add native market collection controls | D / 35 | Q043, Q009 |
| Q089 | 3 | Add native branding controls | D / 30 | Q043, Q010 |
| Q090 | 3 | Add official social profile controls | E / 20 | Q043, Q010 |
| Q091 | 3 | Add separately reviewable person controls | D / 25 | Q043, Q011 |
| Q092 | 3 | Add complete offering controls | D / 30 | Q043, Q013 |
| Q093 | 3 | Connect all seven category forms to draft state | D / 30 | Q087, Q088, Q089, Q090, Q091, Q092, Q069 |
| Q094 | 3 | Prove complete fixture extraction and provenance | D / 30 | Q086, Q017, Q093 |
| Q095 | 4 | Recompute provenance only for changed leaves | D / 30 | Q015, Q033 |
| Q096 | 4 | Record bounded human conflict resolutions | D / 30 | Q095, Q084, Q093 |
| Q097 | 4 | Complete explicit save, approve and reject workflow | D / 30 | Q096, Q040 |
| Q098 | 4 | Restore history into a new revision | D / 30 | Q033 |
| Q099 | 4 | Expose immutable history and protected revert routes | D / 25 | Q038, Q098 |
| Q100 | 4 | Browse entry history and restore prior content | D / 25 | Q099, Q097 |
| Q101 | 4 | Apply selected proposals with current revision checks | C / 40 | Q085, Q033, Q095 |
| Q102 | 4 | Dismiss proposals without deleting evidence | D / 25 | Q085, Q025 |
| Q103 | 4 | Expose protected proposal apply and dismiss routes | D / 25 | Q038, Q101, Q102 |
| Q104 | 4 | Compare and review re-scrape proposals | D / 30 | Q103, Q097, Q069 |
| Q105 | 4 | Format honest deterministic APA references | D / 25 | Q012 |
| Q106 | 4 | Build an accessible interactive evidence popover | D / 35 | Q105, Q002 |
| Q107 | 4 | Expose citations for every factual leaf | D / 30 | Q106, Q104, Q014 |
| Q108 | 4 | Prove corrections, re-scrapes and citation interaction | D / 35 | Q107, Q100, Q002 |
| Q109 | 5 | Change company metadata with generation checks | D / 30 | Q025, Q052, Q036 |
| Q110 | 5 | Protect owner-only membership management | C / 35 | Q025, Q031, Q051 |
| Q111 | 5 | Archive companies without deleting history | D / 30 | Q025, Q047, Q051 |
| Q112 | 5 | Expose company metadata, membership and archive APIs | D / 30 | Q038, Q109, Q110, Q111 |
| Q113 | 5 | Add simple company settings and archive access | D / 35 | Q112, Q042, Q041 |
| Q114 | 5 | Finalize snapshot contract and digest integrity checks | C / 40 | Q035, Q101, Q098, Q109, Q094 |
| Q115 | 5 | Browse per-company saved versions and draft | D / 30 | Q041, Q100, Q107, Q113 |
| Q116 | 5 | Render cards, compact table and detailed evidence | D / 35 | Q115 |
| Q117 | 5 | Search and filter the bounded current company view | D / 25 | Q116 |
| Q118 | 5 | Complete publication readiness and stale preview UX | D / 25 | Q045, Q115, Q108 |
| Q119 | 5 | Prove snapshot and membership serialization | D / 35 | Q114, Q110, Q111, Q036 |
| Q120 | 5 | Document and configure persistent native service deployment | D / 35 | Q067, Q058, Q003, Q001 |
| Q121 | 5 | Expose minimal worker and queue failure visibility | D / 25 | Q067, Q120 |
| Q122 | 5 | Qualify the configured model on the controlled fixture | D / 25 | Q094, Q003 |
| Q123 | 5 | Prove the one essential seven-category E2E flow | D / 35 | Q118, Q069, Q086, Q002 |
| Q124 | 5 | Close release gates with exact-environment evidence | D / 35 | Q123, Q117, Q119, Q071, Q070, Q122, Q121, Q120, Q001 |

## Complete Quest catalog

## Phase 0: Establish contracts and runtime

Acceptance gate (Q001, Q013, Q015, Q022, Q023): Reviewed complete contracts/defaults, branded fixture shell and recorded host/model capability decisions. Unclosed live capability gates remain explicit.

Phase completion requires these outcome checks and relevant required deliverables; do not add blanket all-phase dependency edges. Local fixtures do not close live setup gates.

Phase-entry work with only earlier-phase inputs: Q001, Q003, Q018

### Q001 — Pin the application toolchain and package scripts

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Create the smallest Next.js 15/Node 22 TypeScript/Tailwind project configuration and development commands.

Source: MVP boundary (L11–13); Fixed decisions and verification gates (L23–32); Setup required before implementation and release (L1478–1482).

**Acceptance criteria / scope in**

- Pin patched compatible Next.js 15, React, Tailwind, Supabase SDK, Zod, Playwright and OpenAI SDK in package/lock configuration; document exact support evidence and leave an unsupported version decision blocked.
- Provide web, worker, typecheck, build, unit, database and E2E entry commands; worker/test commands may target files delivered by later quests and are explicitly marked pending.
- No Docker command or Guild tool is a prerequisite; no secret or operational credential is committed.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `docs/runtime-support.md`.

Touches: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `docs/runtime-support.md`.

**Dependencies**

None; entry-ready once repository instructions and status are checked.

**Planned verification (not run)**

- Planned: npm ci; npm run typecheck and npm run build once shell exists. Review Node 22/vendor support matrix.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q002 — Set up deterministic test runners

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Configure one proportional unit runner, database test launcher and serialized browser launcher.

Source: Focused test inventory (L1428–1445).

**Acceptance criteria / scope in**

- Unit tests run offline on exact test files with controlled time/IDs where needed.
- Database tests use an explicitly configured disposable native/managed PostgreSQL test database, never production; E2E starts only the test services and serializes fixed-port runs with a timeout.
- Test fixture egress is an explicit test-only allowlist; no production localhost exception and no browser installation step.

**Scope out**

- Guild Trials
- Running test services during planning
- Unrelated refactors and optional post-MVP features

**Files**

Creates: `vitest.config.ts`, `playwright.config.ts`, `scripts/test-db.mjs`, `scripts/test-browser.mjs`, `tests/helpers/fixture-policy.ts`.

Touches: `vitest.config.ts`, `playwright.config.ts`, `scripts/test-db.mjs`, `scripts/test-browser.mjs`, `tests/helpers/fixture-policy.ts`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.

**Planned verification (not run)**

- Focused deterministic checks for: Unit tests run offline on exact test files with controlled time/IDs where needed.
- Focused deterministic checks for: Database tests use an explicitly configured disposable native/managed PostgreSQL test database, never production; E2E starts only the test services and serializes fixed-port runs with a timeout.
- Focused deterministic checks for: Test fixture egress is an explicit test-only allowlist; no production localhost exception and no browser installation step.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q003 — Record provider and authentication setup gates

chore · Rank E · 20 min estimate · gpt-6-luna / medium effort

Document the unresolved hosting, Supabase, Auth and model capabilities before live integration.

Source: Fixed decisions and verification gates (L23–32); Setup required before implementation and release (L1476–1482).

**Acceptance criteria / scope in**

- Record owner-supplied Supabase project/version, TLS/connection limits/direct-versus-pooler behavior, Auth method/redirects and extension/role requirements as unresolved until supplied.
- List selected strict-output model, token ceilings, data processing terms, secret injection names and backup requirements without inventing values or reading credentials.
- Separate local fixture-completable work from live setup; only publishable config may use NEXT_PUBLIC_.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `docs/provider-setup.md`.

Touches: `docs/provider-setup.md`.

**Dependencies**

None; entry-ready once repository instructions and status are checked.

**Planned verification (not run)**

- Focused deterministic checks for: Record owner-supplied Supabase project/version, TLS/connection limits/direct-versus-pooler behavior, Auth method/redirects and extension/role requirements as unresolved until supplied.
- Focused deterministic checks for: List selected strict-output model, token ceilings, data processing terms, secret injection names and backup requirements without inventing values or reading credentials.
- Focused deterministic checks for: Separate local fixture-completable work from live setup; only publishable config may use NEXT_PUBLIC_.

Sizing: Small mechanical configuration or bounded data definition. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Mechanical bounded work.

Setup gate: `provider_configuration`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

### Q004 — Specify a qualified non-Docker renderer boundary

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Write a host-capability and egress qualification plan that preserves the renderer security boundary without Docker.

Source: Components (L40–48); Network and rendering security (L92–98); Setup required before implementation and release (L1480–1482).

**Acceptance criteria / scope in**

- Specify persistent web/worker, separate secret-free renderer process, private authenticated task channel, enforced outbound proxy/firewall, Chromium sandbox and resource/restart controls using host-native capabilities.
- List probes for blocked private/internal/metadata access, direct DNS/sockets/UDP/QUIC, browser bypass/subresources and worker/database/model isolation; application request routing alone cannot qualify confinement.
- Keep host choice/capabilities unresolved and arbitrary URL execution gated until proof; a sample browser render proves rendering only, never production network confinement.

**Scope out**

- Docker dependency
- Replacing enforcement with a mock or interception hook
- Unrelated refactors and optional post-MVP features

**Files**

Creates: `docs/renderer-host-qualification.md`.

Touches: `docs/renderer-host-qualification.md`.

**Dependencies**

- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.

**Planned verification (not run)**

- Focused deterministic checks for: Specify persistent web/worker, separate secret-free renderer process, private authenticated task channel, enforced outbound proxy/firewall, Chromium sandbox and resource/restart controls using host-native capabilities.
- Focused deterministic checks for: List probes for blocked private/internal/metadata access, direct DNS/sockets/UDP/QUIC, browser bypass/subresources and worker/database/model isolation; application request routing alone cannot qualify confinement.
- Focused deterministic checks for: Keep host choice/capabilities unresolved and arbitrary URL execution gated until proof; a sample browser render proves rendering only, never production network confinement.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

Setup gate: `non_docker_host_qualification`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

### Q005 — Define primitive and reusable value schemas

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement strict branded primitives and small reusable business structures.

Source: Reusable validation contract (L635–680); Reusable validation contract (L770–774).

**Acceptance criteria / scope in**

- UUID, HTTP(S) URL, date-only, instant, bounded string and IdentifiedText schemas reject unknown keys and malformed values.
- Address, Persona, Partner, Commentary, Channel, Funnel, CTA, Font, Color, Logo and SocialLink have required nullable fields, stable item UUIDs and bounded arrays.
- Font methods are canonical sorted metadata; colors enforce #RRGGBB and alpha bounds; no executable asset payloads.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/primitives.ts`, `src/contracts/value-types.ts`, `tests/contracts/value-types.test.ts`.

Touches: `src/contracts/primitives.ts`, `src/contracts/value-types.ts`, `tests/contracts/value-types.test.ts`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.

**Planned verification (not run)**

- Focused deterministic checks for: UUID, HTTP(S) URL, date-only, instant, bounded string and IdentifiedText schemas reject unknown keys and malformed values.
- Focused deterministic checks for: Address, Persona, Partner, Commentary, Channel, Funnel, CTA, Font, Color, Logo and SocialLink have required nullable fields, stable item UUIDs and bounded arrays.
- Focused deterministic checks for: Font methods are canonical sorted metadata; colors enforce #RRGGBB and alpha bounds; no executable asset payloads.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q006 — Define employee and pricing normalization

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement employee-count and offering-pricing schemas with lossless raw wording and decimal money.

Source: Reusable validation contract (L646–649); Reusable validation contract (L685–691); Reusable validation contract (L770–770).

**Acceptance criteria / scope in**

- Employee exact/range forms are exclusive, whole and nonnegative with min<=max and nullable explicit as-of date; raw text is preserved and a range never becomes an invented exact count.
- Pricing distinguishes null, free, contact and paid; known numeric pricing has one amount or range as decimal strings, nullable currency/interval and retained qualifications/raw wording.
- Reject contradictory numeric forms, negative amounts and fabricated free/contact zero; deterministic representative fixtures cover employee range and free/contact/no-price.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/numeric-values.ts`, `tests/contracts/numeric-values.test.ts`.

Touches: `src/contracts/numeric-values.ts`, `tests/contracts/numeric-values.test.ts`.

**Dependencies**

- Q005: Consumes strict UUID/URL/date/instant and reusable nested value types.

**Planned verification (not run)**

- Focused deterministic checks for: Employee exact/range forms are exclusive, whole and nonnegative with min<=max and nullable explicit as-of date; raw text is preserved and a range never becomes an invented exact count.
- Focused deterministic checks for: Pricing distinguishes null, free, contact and paid; known numeric pricing has one amount or range as decimal strings, nullable currency/interval and retained qualifications/raw wording.
- Focused deterministic checks for: Reject contradictory numeric forms, negative amounts and fabricated free/contact zero; deterministic representative fixtures cover employee range and free/contact/no-price.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q007 — Define Company Foundation contract

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Encode all twelve foundation fields and their defaults/origin permissions.

Source: Company Foundation (L106–121); Reusable validation contract (L697–704).

**Acceptance criteria / scope in**

- All twelve required keys are present with null/[] defaults; strict types include nullable employee/address composites and stable location IDs.
- Founding year has sensible bounds; legal type, headquarters and exact employees are never synthesized by defaults.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/company-foundation.ts`, `tests/contracts/company-foundation.test.ts`.

Touches: `src/contracts/company-foundation.ts`, `tests/contracts/company-foundation.test.ts`.

**Dependencies**

- Q006: Consumes lossless employee-count and decimal-money pricing schemas.

**Planned verification (not run)**

- Focused deterministic checks for: All twelve required keys are present with null/[] defaults; strict types include nullable employee/address composites and stable location IDs.
- Focused deterministic checks for: Founding year has sensible bounds; legal type, headquarters and exact employees are never synthesized by defaults.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q008 — Define Positioning contract

feature · Rank E · 20 min estimate · gpt-6-luna / medium effort

Encode pitch and founding story with distinct origin permissions.

Source: Positioning (L123–128); Reusable validation contract (L705–705).

**Acceptance criteria / scope in**

- Both keys default to null; source/user pitch and separately generated pitch are allowed while founding story accepts source/user only.
- A founding year alone cannot satisfy a founding-story evidence rule.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/positioning.ts`, `tests/contracts/positioning.test.ts`.

Touches: `src/contracts/positioning.ts`, `tests/contracts/positioning.test.ts`.

**Dependencies**

- Q005: Consumes strict UUID/URL/date/instant and reusable nested value types.

**Planned verification (not run)**

- Focused deterministic checks for: Both keys default to null; source/user pitch and separately generated pitch are allowed while founding story accepts source/user only.
- Focused deterministic checks for: A founding year alone cannot satisfy a founding-story evidence rule.

Sizing: Small mechanical configuration or bounded data definition. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Mechanical bounded work.

### Q009 — Define Market and Customers contract

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Encode all nine market fields and reusable collections.

Source: Market and Customers (L130–142); Reusable validation contract (L650–669); Reusable validation contract (L706–711).

**Acceptance criteria / scope in**

- All nine required collections default to []; nested personas, commentary, channels, funnels, CTAs and partners have strict keys and stable IDs.
- Origin permissions distinguish generated personas, inferred purpose/classification and source-only outlook/partner relationships; logo-only relationship remains null.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/market-and-customers.ts`, `tests/contracts/market-and-customers.test.ts`.

Touches: `src/contracts/market-and-customers.ts`, `tests/contracts/market-and-customers.test.ts`.

**Dependencies**

- Q005: Consumes strict UUID/URL/date/instant and reusable nested value types.

**Planned verification (not run)**

- Focused deterministic checks for: All nine required collections default to []; nested personas, commentary, channels, funnels, CTAs and partners have strict keys and stable IDs.
- Focused deterministic checks for: Origin permissions distinguish generated personas, inferred purpose/classification and source-only outlook/partner relationships; logo-only relationship remains null.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q010 — Define Branding and Online Presence contracts

feature · Rank E · 20 min estimate · gpt-6-luna / medium effort

Encode the five branding fields and official social-link collection.

Source: Branding and Style (L144–152); Online Presence (L154–158); Reusable validation contract (L712–716).

**Acceptance criteria / scope in**

- Style descriptions are nullable; fonts/colors/logos/social links default to [] with strict nested structures.
- Observation versus inference and brand-confirmation metadata remain distinct; social links accept profile URLs, not share/intent observations.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/branding-and-style.ts`, `src/contracts/online-presence.ts`, `tests/contracts/brand-presence.test.ts`.

Touches: `src/contracts/branding-and-style.ts`, `src/contracts/online-presence.ts`, `tests/contracts/brand-presence.test.ts`.

**Dependencies**

- Q005: Consumes strict UUID/URL/date/instant and reusable nested value types.

**Planned verification (not run)**

- Focused deterministic checks for: Style descriptions are nullable; fonts/colors/logos/social links default to [] with strict nested structures.
- Focused deterministic checks for: Observation versus inference and brand-confirmation metadata remain distinct; social links accept profile URLs, not share/intent observations.

Sizing: Small mechanical configuration or bounded data definition. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Mechanical bounded work.

### Q011 — Define Person and Offering entry contracts

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Encode repeatable people and offering entries with permanent IDs and allowed unknowns.

Source: Key People (L160–170); Offerings (L172–184); Reusable validation contract (L681–696).

**Acceptance criteria / scope in**

- Person has all five nullable business keys; offering has all seven required business keys and nullable pricing, stable features and observed URL.
- Reject wholly empty people/offerings, unknown keys and duplicate nested IDs; gender is nullable and populated values require explicit self-description attestation in provenance validation.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/person.ts`, `src/contracts/offering.ts`, `tests/contracts/person-offering.test.ts`.

Touches: `src/contracts/person.ts`, `src/contracts/offering.ts`, `tests/contracts/person-offering.test.ts`.

**Dependencies**

- Q006: Consumes lossless employee-count and decimal-money pricing schemas.

**Planned verification (not run)**

- Focused deterministic checks for: Person has all five nullable business keys; offering has all seven required business keys and nullable pricing, stable features and observed URL.
- Focused deterministic checks for: Reject wholly empty people/offerings, unknown keys and duplicate nested IDs; gender is nullable and populated values require explicit self-description attestation in provenance validation.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q012 — Define evidence, claim and proposal envelopes

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Create strict typed internal source, provenance, job and extraction envelopes.

Source: API and background-job contracts (L573–597); Reusable validation contract (L717–774).

**Acceptance criteria / scope in**

- Define Source/Evidence/Claim/Coverage/operations and entry/export review states; evidence is text or labeled technical observation with bounded nullable metadata.
- Proposal/candidate/conflict envelopes hold model/prompt/schema versions outside plain business values; model output excludes author/review/source metadata assigned by trusted code.
- Progress/status/checkpoint/error schemas cover safe counts, stage, frontier, budgets, extraction completion IDs and sanitized errors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/provenance.ts`, `src/contracts/jobs.ts`, `src/contracts/proposals.ts`, `tests/contracts/envelopes.test.ts`.

Touches: `src/contracts/provenance.ts`, `src/contracts/jobs.ts`, `src/contracts/proposals.ts`, `tests/contracts/envelopes.test.ts`.

**Dependencies**

- Q007: Consumes the twelve-field CompanyFoundation schema/default contract.
- Q008: Consumes Positioning schema and pitch/story origin permissions.
- Q009: Consumes nine market collection schemas and their origin restrictions.
- Q010: Consumes BrandingAndStyle/OnlinePresence schemas and observation metadata.
- Q011: Consumes strict repeatable Person/Offering schemas with permanent item IDs.

**Planned verification (not run)**

- Focused deterministic checks for: Define Source/Evidence/Claim/Coverage/operations and entry/export review states; evidence is text or labeled technical observation with bounded nullable metadata.
- Focused deterministic checks for: Proposal/candidate/conflict envelopes hold model/prompt/schema versions outside plain business values; model output excludes author/review/source metadata assigned by trusted code.
- Focused deterministic checks for: Progress/status/checkpoint/error schemas cover safe counts, stage, frontier, budgets, extraction completion IDs and sanitized errors.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q013 — Assemble the complete field registry and defaults

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Provide one declarative registry of all 41 required fields and complete export/default schemas.

Source: Extraction coverage matrix (L100–184); Reusable validation contract (L754–774).

**Acceptance criteria / scope in**

- Registry maps all 41 exact field paths to types/defaults, allowed origins and coverage requirements, including existing person/offering item fields.
- Complete schema has five singleton objects, key_people and offerings arrays, version metadata and provenance; required keys and unknown-key rejection apply at every nesting level.
- A representative null/default export passes and incomplete objects fail; browser and worker import shared contracts without secret-bearing modules.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/field-registry.ts`, `src/contracts/defaults.ts`, `src/contracts/knowledge-base.ts`, `tests/contracts/registry.test.ts`.

Touches: `src/contracts/field-registry.ts`, `src/contracts/defaults.ts`, `src/contracts/knowledge-base.ts`, `tests/contracts/registry.test.ts`.

**Dependencies**

- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.

**Planned verification (not run)**

- Focused deterministic checks for: Registry maps all 41 exact field paths to types/defaults, allowed origins and coverage requirements, including existing person/offering item fields.
- Focused deterministic checks for: Complete schema has five singleton objects, key_people and offerings arrays, version metadata and provenance; required keys and unknown-key rejection apply at every nesting level.
- Focused deterministic checks for: A representative null/default export passes and incomplete objects fail; browser and worker import shared contracts without secret-bearing modules.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q014 — Resolve stable provenance paths

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement JSON Pointer escaping plus @UUID item selection without positional business references.

Source: Stable paths and content provenance (L623–629).

**Acceptance criteria / scope in**

- Resolve escaped keys, nested @UUID selections and enum-metadata indices; reject unknown/duplicate IDs, removed targets and malformed paths.
- Reordering stable-ID arrays preserves claim targets; item IDs/application metadata are excluded from factual-leaf citation requirements.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/stable-pointer.ts`, `tests/contracts/stable-pointer.test.ts`.

Touches: `src/contracts/stable-pointer.ts`, `tests/contracts/stable-pointer.test.ts`.

**Dependencies**

- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.

**Planned verification (not run)**

- Focused deterministic checks for: Resolve escaped keys, nested @UUID selections and enum-metadata indices; reject unknown/duplicate IDs, removed targets and malformed paths.
- Focused deterministic checks for: Reordering stable-ID arrays preserves claim targets; item IDs/application metadata are excluded from factual-leaf citation requirements.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q015 — Validate compatible claims and complete coverage

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement shared semantic provenance validation for saved entries and exports.

Source: Stable paths and content provenance (L629–631); Reusable validation contract (L770–774); Complete illustrative export (L1372–1372).

**Acceptance criteria / scope in**

- Every populated business leaf has compatible origin/evidence; inferred/generated claims have support, allowed field origins are enforced, claim graph is acyclic and current dependencies resolve.
- User claims require actor/time/correction note; approval cannot relabel origin, and coverage resolves exactly once for every required field independently of review/value.
- Validate explicit self-description for gender, historical supersedes references separately from current based_on claims, and reject unknown/duplicate IDs or unresolved selected conflicts.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/contracts/validate-provenance.ts`, `tests/contracts/validate-provenance.test.ts`.

Touches: `src/contracts/validate-provenance.ts`, `tests/contracts/validate-provenance.test.ts`.

**Dependencies**

- Q014: Consumes escaped stable-pointer resolver and factual-leaf enumeration.

**Planned verification (not run)**

- Focused deterministic checks for: Every populated business leaf has compatible origin/evidence; inferred/generated claims have support, allowed field origins are enforced, claim graph is acyclic and current dependencies resolve.
- Focused deterministic checks for: User claims require actor/time/correction note; approval cannot relabel origin, and coverage resolves exactly once for every required field independently of review/value.
- Focused deterministic checks for: Validate explicit self-description for gender, historical supersedes references separately from current based_on claims, and reject unknown/duplicate IDs or unresolved selected conflicts.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q016 — Create the controlled company website fixture

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Build the finite deterministic website fixture and documented expected observations.

Source: One essential end-to-end scenario (L1447–1449); Focused test inventory (L1430–1430).

**Acceptance criteria / scope in**

- Home, About/Team, Pricing, Contact and JS FAQ include overview, range employees, service geography, person/title without gender, offering features/paid pricing, social link, CSS font/color and company logo.
- Include conflicting addresses, absent founding story/legal type/outlook, partial optional route, and hostile text; fixture manifest states expected segments and coverage.
- Fixture runs only inside explicit test networking; no live sites/model calls are CI dependencies.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/fixtures/site/server.mjs`, `tests/fixtures/site/home.html`, `tests/fixtures/site/about.html`, `tests/fixtures/site/pricing.html`, `tests/fixtures/site/contact.html`, `tests/fixtures/site/faq.html`, `tests/fixtures/site/style.css`, `tests/fixtures/site/logo.svg`, `tests/fixtures/site/manifest.json`.

Touches: `tests/fixtures/site/server.mjs`, `tests/fixtures/site/home.html`, `tests/fixtures/site/about.html`, `tests/fixtures/site/pricing.html`, `tests/fixtures/site/contact.html`, `tests/fixtures/site/faq.html`, `tests/fixtures/site/style.css`, `tests/fixtures/site/logo.svg`, `tests/fixtures/site/manifest.json`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.

**Planned verification (not run)**

- Focused deterministic checks for: Home, About/Team, Pricing, Contact and JS FAQ include overview, range employees, service geography, person/title without gender, offering features/paid pricing, social link, CSS font/color and company logo.
- Focused deterministic checks for: Include conflicting addresses, absent founding story/legal type/outlook, partial optional route, and hostile text; fixture manifest states expected segments and coverage.
- Focused deterministic checks for: Fixture runs only inside explicit test networking; no live sites/model calls are CI dependencies.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q017 — Record structured extraction fixtures

chore · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Create bounded recorded responses and malformed/refused variants for deterministic model checks.

Source: Focused test inventory (L1430–1437); Complete illustrative export (L776–1372).

**Acceptance criteria / scope in**

- Fixtures cover all seven categories/41 fields, null absences, generated pitch, inferred style, user correction, technical evidence and address conflict without treating illustrative values as real data.
- Provide finite variants for refusal, incomplete JSON, fake quote/source, forbidden origin, same-name entities and free/contact/unknown pricing; expected results name semantic failures.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/fixtures/model/valid.json`, `tests/fixtures/model/invalid-cases.json`, `tests/fixtures/model/expected.json`.

Touches: `tests/fixtures/model/valid.json`, `tests/fixtures/model/invalid-cases.json`, `tests/fixtures/model/expected.json`.

**Dependencies**

- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.
- Q016: Consumes controlled HTML/CSS/JS company pages and expected evidence manifest.

**Planned verification (not run)**

- Focused deterministic checks for: Fixtures cover all seven categories/41 fields, null absences, generated pitch, inferred style, user correction, technical evidence and address conflict without treating illustrative values as real data.
- Focused deterministic checks for: Provide finite variants for refusal, incomplete JSON, fake quote/source, forbidden origin, same-name entities and free/contact/unknown pricing; expected results name semantic failures.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q018 — Prepare company and membership schema

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Prepare reviewable migration for companies and company_members with dedicated ownership.

Source: Entry granularity and common rules (L220–224); Proposed table definitions (L229–255); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Create private schema/dedicated non-login migration owner and exactly the two source-defined tables with keys, checks, timestamps and indexes; no global website uniqueness.
- Auth-user references use RESTRICT; identity reassignment and application schema CREATE are not permitted; connection/role provisioning is documented, not invented.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0001_companies.sql`, `docs/database-bootstrap.md`.

Touches: `supabase/migrations/0001_companies.sql`, `docs/database-bootstrap.md`.

**Dependencies**

None; entry-ready once repository instructions and status are checked.

**Planned verification (not run)**

- Focused deterministic checks for: Create private schema/dedicated non-login migration owner and exactly the two source-defined tables with keys, checks, timestamps and indexes; no global website uniqueness.
- Focused deterministic checks for: Auth-user references use RESTRICT; identity reassignment and application schema CREATE are not permitted; connection/role provisioning is documented, not invented.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q019 — Prepare job and source schema

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Prepare durable scrape_jobs and immutable capture table definitions.

Source: Proposed table definitions (L257–330); Proposed table definitions (L398–398).

**Acceptance criteria / scope in**

- Create scrape_jobs/source_pages with source-defined columns, statuses, JSON shapes, active-job uniqueness, bounded attempts, lease/finished checks and indexes.
- Use company-qualified job FK, normalized URL uniqueness and captured-row required fields; no Redis/queue table and no full source bodies in export contracts.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0002_jobs_sources.sql`.

Touches: `supabase/migrations/0002_jobs_sources.sql`.

**Dependencies**

- Q018: Consumes company/member table keys, identity and non-login ownership.

**Planned verification (not run)**

- Focused deterministic checks for: Create scrape_jobs/source_pages with source-defined columns, statuses, JSON shapes, active-job uniqueness, bounded attempts, lease/finished checks and indexes.
- Focused deterministic checks for: Use company-qualified job FK, normalized URL uniqueness and captured-row required fields; no Redis/queue table and no full source bodies in export contracts.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q020 — Prepare entry and revision schema

chore · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Prepare entry identities and append-only revisions with deferred current-pointer integrity.

Source: Proposed table definitions (L332–371).

**Acceptance criteria / scope in**

- Create knowledge_entries/knowledge_entry_versions exactly with singleton uniqueness, kind constraints, author references and declared indexes.
- Company-qualified revision FK and DEFERRABLE INITIALLY DEFERRED current pointer support identity+revision 1 in one transaction.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0003_entries_revisions.sql`.

Touches: `supabase/migrations/0003_entries_revisions.sql`.

**Dependencies**

- Q018: Consumes company/member table keys, identity and non-login ownership.

**Planned verification (not run)**

- Focused deterministic checks for: Create knowledge_entries/knowledge_entry_versions exactly with singleton uniqueness, kind constraints, author references and declared indexes.
- Focused deterministic checks for: Company-qualified revision FK and DEFERRABLE INITIALLY DEFERRED current pointer support identity+revision 1 in one transaction.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q021 — Prepare snapshot schema

chore · Rank E · 20 min estimate · gpt-6-luna / medium effort

Prepare immutable knowledge_base_versions with relational idempotency and payload metadata checks.

Source: Proposed table definitions (L373–396).

**Acceptance criteria / scope in**

- Create snapshots with company/version/request uniqueness, manifest/payload shapes, digest format and payload metadata consistency checks.
- Preserve seven total baseline tables and only the defined indexes; no broad JSON GIN index.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0004_snapshots.sql`.

Touches: `supabase/migrations/0004_snapshots.sql`.

**Dependencies**

- Q018: Consumes company/member table keys, identity and non-login ownership.

**Planned verification (not run)**

- Focused deterministic checks for: Create snapshots with company/version/request uniqueness, manifest/payload shapes, digest format and payload metadata consistency checks.
- Focused deterministic checks for: Preserve seven total baseline tables and only the defined indexes; no broad JSON GIN index.

Sizing: Small mechanical configuration or bounded data definition. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Mechanical bounded work.

### Q022 — Build the branded sign-in and app shell

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Provide a minimal MoFloKnowledge shell with BEM styling and fixture category design review.

Source: MVP boundary (L9–13); Phase 0 Establish contracts and runtime (L1380–1384).

**Acceptance criteria / scope in**

- Navigation/page titles use MoFloKnowledge and BEM blocks company-dashboard, knowledge-editor, scrape-progress, citation-popover and version-viewer with Tailwind composition.
- Static fixture editor exposes seven category tabs and escaped sample/default values for design review; it is clearly a design fixture before authentication/data wiring.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/sign-in/page.tsx`, `src/components/fixture-editor.tsx`.

Touches: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/sign-in/page.tsx`, `src/components/fixture-editor.tsx`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.
- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.

**Planned verification (not run)**

- Focused deterministic checks for: Navigation/page titles use MoFloKnowledge and BEM blocks company-dashboard, knowledge-editor, scrape-progress, citation-popover and version-viewer with Tailwind composition.
- Focused deterministic checks for: Static fixture editor exposes seven category tabs and escaped sample/default values for design review; it is clearly a design fixture before authentication/data wiring.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q023 — Qualify configured runtime capabilities with a small sample

chore · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Provide a bounded non-Docker pre-crawl compatibility probe and record unresolved capabilities.

Source: Fixed decisions and verification gates (L23–32); Phase 0 Establish contracts and runtime (L1382–1384).

**Acceptance criteria / scope in**

- On the owner-selected host, sample Node22/web and separate secret-free Chromium processes start and a representative page loads through the configured proxy; record exact dependencies/runtime/support results.
- A minimal representative strict structured-output request proves configured model/API schema support; absent host/model credentials keep live results NOT_PROVEN and do not block local contract work.
- Sample rendering is explicitly insufficient for confinement; enforced egress qualification still gates arbitrary URL execution and final release.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `scripts/probe-runtime.mjs`, `docs/runtime-probe.md`.

Touches: `scripts/probe-runtime.mjs`, `docs/runtime-probe.md`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.
- Q004: Consumes private secret-free renderer and enforced-proxy host qualification contract.

**Planned verification (not run)**

- Focused deterministic checks for: On the owner-selected host, sample Node22/web and separate secret-free Chromium processes start and a representative page loads through the configured proxy; record exact dependencies/runtime/support results.
- Focused deterministic checks for: A minimal representative strict structured-output request proves configured model/API schema support; absent host/model credentials keep live results NOT_PROVEN and do not block local contract work.
- Focused deterministic checks for: Sample rendering is explicitly insufficient for confinement; enforced egress qualification still gates arbitrary URL execution and final release.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

Setup gate: `runtime_model_compatibility`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

## Phase 1: Company isolation and a manual end-to-end path

Acceptance gate (Q046): Sign in, create company, enter foundation manually, save/approve, publish and download valid seven-category JSON; second tenant denied.

Phase completion requires these outcome checks and relevant required deliverables; do not add blanket all-phase dependency edges. Local fixtures do not close live setup gates.

Phase-entry work with only earlier-phase inputs: Q024, Q027, Q034, Q037

### Q024 — Apply migrations only to a disposable test database

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Provide the database integration fixture and migration command without a Docker dependency.

Source: Phase 1 Company isolation and a manual end-to-end path (L1388–1392); Setup required before implementation and release (L1480–1482).

**Acceptance criteria / scope in**

- Launcher requires explicit test-only connection configuration, applies ordered migrations with native/managed PostgreSQL and seeds two Auth users/companies under isolated test ownership.
- Document migration/reset/start commands, PostgreSQL/extension compatibility and owner/worker role provisioning; refuse production targets and never log credentials.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/db/setup.ts`, `scripts/migrate.mjs`, `docs/database-operations.md`.

Touches: `tests/db/setup.ts`, `scripts/migrate.mjs`, `docs/database-operations.md`.

**Dependencies**

- Q002: Consumes offline test configuration, disposable-database launcher and serialized browser runner.
- Q018: Consumes company/member table keys, identity and non-login ownership.
- Q019: Consumes durable job/source tables and company-qualified capture uniqueness.
- Q020: Consumes identity/revision tables with singleton/deferred-pointer constraints.
- Q021: Consumes snapshot table, counter identity fields and payload consistency constraints.

**Planned verification (not run)**

- Focused deterministic checks for: Launcher requires explicit test-only connection configuration, applies ordered migrations with native/managed PostgreSQL and seeds two Auth users/companies under isolated test ownership.
- Focused deterministic checks for: Document migration/reset/start commands, PostgreSQL/extension compatibility and owner/worker role provisioning; refuse production targets and never log credentials.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q025 — Enforce membership reads and default-deny writes

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Apply role ownership, grants and RLS to all seven tables.

Source: Authorization and RLS (L415–504); Protected functions and trust boundaries (L508–508); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- private.company_role derives only auth.uid(), uses fixed empty search_path under a non-login owner and avoids recursive membership RLS.
- All seven authenticated SELECT policies require membership; anon/PUBLIC have no table access; revoke client writes except UPDATE(name) for owner/editor on unarchived companies with USING/WITH CHECK.
- Revoke default function EXECUTE/schema CREATE; company rename increments generation under the company row lock and immutable identity fields cannot be reassigned.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0005_access.sql`, `tests/db/access.test.ts`.

Touches: `supabase/migrations/0005_access.sql`, `tests/db/access.test.ts`.

**Dependencies**

- Q024: Consumes ordered baseline migration fixture and two-user test database setup.

**Planned verification (not run)**

- Focused deterministic checks for: private.company_role derives only auth.uid(), uses fixed empty search_path under a non-login owner and avoids recursive membership RLS.
- Focused deterministic checks for: All seven authenticated SELECT policies require membership; anon/PUBLIC have no table access; revoke client writes except UPDATE(name) for owner/editor on unarchived companies with USING/WITH CHECK.
- Focused deterministic checks for: Revoke default function EXECUTE/schema CREATE; company rename increments generation under the company row lock and immutable identity fields cannot be reassigned.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q026 — Reject mutation of historical rows

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Install immutable source, revision and snapshot guards and identity protection.

Source: Relationships and historical integrity (L400–413).

**Acceptance criteria / scope in**

- UPDATE/DELETE of sources, revisions and snapshots always fail, including trusted write paths; entry identity/company/kind/creator and company/member identity columns cannot be reassigned.
- No cascade/delete path discards historical Auth references/evidence; company archive remains the deletion model.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0006_immutability.sql`, `tests/db/immutability.test.ts`.

Touches: `supabase/migrations/0006_immutability.sql`, `tests/db/immutability.test.ts`.

**Dependencies**

- Q024: Consumes ordered baseline migration fixture and two-user test database setup.

**Planned verification (not run)**

- Focused deterministic checks for: UPDATE/DELETE of sources, revisions and snapshots always fail, including trusted write paths; entry identity/company/kind/creator and company/member identity columns cannot be reassigned.
- Focused deterministic checks for: No cascade/delete path discards historical Auth references/evidence; company archive remains the deletion model.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q027 — Generate SQL contract/default parity artifacts

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Generate a small SQL field/default registry from the shared declarative contract.

Source: Revisions and publication transactions (L616–619); Reusable validation contract (L770–774).

**Acceptance criteria / scope in**

- A deterministic development generator emits SQL defaults and validation registry for the same seven categories/41 fields; a stale-artifact check catches drift.
- Database/TypeScript parity checks cover all default keys and representative nullable/nested values; no new registry table.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `scripts/generate-sql-contract.mjs`, `supabase/generated/business-contract.sql`, `tests/contracts/sql-parity.test.ts`.

Touches: `scripts/generate-sql-contract.mjs`, `supabase/generated/business-contract.sql`, `tests/contracts/sql-parity.test.ts`.

**Dependencies**

- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.

**Planned verification (not run)**

- Focused deterministic checks for: A deterministic development generator emits SQL defaults and validation registry for the same seven categories/41 fields; a stale-artifact check catches drift.
- Focused deterministic checks for: Database/TypeScript parity checks cover all default keys and representative nullable/nested values; no new registry table.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q028 — Validate strict saved JSON in protected SQL

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement reusable versioned SQL content, stable-path and coverage validation.

Source: Relationships and historical integrity (L411–411); Reusable validation contract (L770–774); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Validate exact required/unknown keys, bounded types/arrays/numerics, stable item IDs/pointers and exactly-once required-field coverage from the generated registry.
- Return bounded business-validation errors and bind validator triggers to revision inserts so alternate trusted writes cannot bypass them.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0007_validate_content.sql`, `tests/db/content-validation.test.ts`.

Touches: `supabase/migrations/0007_validate_content.sql`, `tests/db/content-validation.test.ts`.

**Dependencies**

- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.
- Q027: Consumes generated versioned SQL defaults and validation-field parity artifact.
- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.

**Planned verification (not run)**

- Focused deterministic checks for: Validate exact required/unknown keys, bounded types/arrays/numerics, stable item IDs/pointers and exactly-once required-field coverage from the generated registry.
- Focused deterministic checks for: Return bounded business-validation errors and bind validator triggers to revision inserts so alternate trusted writes cannot bypass them.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q029 — Enforce claim origin and support semantics in SQL

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Add the protected SQL claim-graph and factual-leaf validator used by revision inserts.

Source: Reusable validation contract (L770–774); Stable paths and content provenance (L629–631); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Every populated business leaf has compatible allowed origin and evidence/support; generated/inferred support resolves without cycles and approval never grants source-backed origin.
- User claims require actor/time/note, populated gender requires explicit self-description attestation and material conflicts require recorded choice or clear.
- Bind semantic validation to revision inserts with bounded typed errors; malformed direct trusted writes fail independently of application checks.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0007b_validate_claims.sql`, `tests/db/claim-semantics.test.ts`.

Touches: `supabase/migrations/0007b_validate_claims.sql`, `tests/db/claim-semantics.test.ts`.

**Dependencies**

- Q028: Consumes protected SQL structural/numeric/path/coverage validation and revision insert trigger.
- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.

**Planned verification (not run)**

- Focused deterministic checks for: Every populated business leaf has compatible allowed origin and evidence/support; generated/inferred support resolves without cycles and approval never grants source-backed origin.
- Focused deterministic checks for: User claims require actor/time/note, populated gender requires explicit self-description attestation and material conflicts require recorded choice or clear.
- Focused deterministic checks for: Bind semantic validation to revision inserts with bounded typed errors; malformed direct trusted writes fail independently of application checks.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q030 — Validate frozen source evidence in protected SQL

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Validate company-qualified recorded evidence and historical supersession references.

Source: Relationships and historical integrity (L408–413); Complete illustrative export (L1372–1372); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Every source ID is same-company/captured; URL/retrieval metadata matches stored source, text quote occurs in stored segments and technical selectors/IDs resolve in recorded observations.
- Validate superseded claims against same-company prior immutable revisions and current based_on claims in the active envelope; do not trust browser-frozen metadata.
- Reusable insert triggers reject forged source/entry references, fake quotes and unresolved technical evidence.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0008_validate_evidence.sql`, `tests/db/evidence-validation.test.ts`.

Touches: `supabase/migrations/0008_validate_evidence.sql`, `tests/db/evidence-validation.test.ts`.

**Dependencies**

- Q029: Consumes protected SQL factual-leaf/origin/support-graph and gender-attestation checks.
- Q019: Consumes durable job/source tables and company-qualified capture uniqueness.

**Planned verification (not run)**

- Focused deterministic checks for: Every source ID is same-company/captured; URL/retrieval metadata matches stored source, text quote occurs in stored segments and technical selectors/IDs resolve in recorded observations.
- Focused deterministic checks for: Validate superseded claims against same-company prior immutable revisions and current based_on claims in the active envelope; do not trust browser-frozen metadata.
- Focused deterministic checks for: Reusable insert triggers reject forged source/entry references, fake quotes and unresolved technical evidence.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q031 — Create company and first owner atomically

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement authenticated idempotent create_company.

Source: Protected functions and trust boundaries (L511–538); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Validate bounded name/URL syntax and configured per-user creation limit; derive creator from auth.uid() and insert owner with company in one transaction.
- Identical request replay returns the same company; different body/key reuse fails; membership failure rolls back company creation and clients cannot self-enroll.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0009_create_company.sql`, `tests/db/create-company.test.ts`.

Touches: `supabase/migrations/0009_create_company.sql`, `tests/db/create-company.test.ts`.

**Dependencies**

- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.

**Planned verification (not run)**

- Focused deterministic checks for: Validate bounded name/URL syntax and configured per-user creation limit; derive creator from auth.uid() and insert owner with company in one transaction.
- Focused deterministic checks for: Identical request replay returns the same company; different body/key reuse fails; membership failure rolls back company creation and clients cannot self-enroll.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q032 — Create an entry identity and first revision atomically

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement protected manual entry creation with idempotency and singleton rules.

Source: API and background-job contracts (L559–571); Revisions and publication transactions (L607–607); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Under company lock require owner/editor/unarchived; validate kind, company-qualified JSON/evidence and create identity plus revision1 with a valid deferred pointer at commit.
- Only person/offering or missing singleton may be created, no wholly empty repeatable entry; derive author and user provenance rather than trusting browser actor metadata.
- Request operation UUID replays matching body and rejects differing reuse, increments generation once and does not create a second singleton.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0010a_create_entry.sql`, `tests/db/create-entry.test.ts`.

Touches: `supabase/migrations/0010a_create_entry.sql`, `tests/db/create-entry.test.ts`.

**Dependencies**

- Q030: Consumes same-company source/quote/technical evidence and historical-reference validators.
- Q026: Consumes append-only history/source guards and protected identity columns.

**Planned verification (not run)**

- Focused deterministic checks for: Under company lock require owner/editor/unarchived; validate kind, company-qualified JSON/evidence and create identity plus revision1 with a valid deferred pointer at commit.
- Focused deterministic checks for: Only person/offering or missing singleton may be created, no wholly empty repeatable entry; derive author and user provenance rather than trusting browser actor metadata.
- Focused deterministic checks for: Request operation UUID replays matching body and rejects differing reuse, increments generation once and does not create a second singleton.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q033 — Save immutable revisions of existing entries

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement save_entry_revision with stale checks, provenance preservation and operation replay.

Source: Protected functions and trust boundaries (L540–540); API and background-job contracts (L559–571); Revisions and publication transactions (L605–607); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Under the company lock recheck role/archive, validate company-qualified IDs/content/provenance and atomically append expectedRevision+1/update pointer/increment generation.
- Request UUID in immutable operation metadata returns matching replay and rejects changed body; stale revision returns current revision without writing.
- Review-only operations append history; edit/clear of approved content becomes unreviewed and edited leaves get user origin/supersedes while unchanged source/generated/inferred origins persist.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0010_save_revisions.sql`, `tests/db/revisions.test.ts`.

Touches: `supabase/migrations/0010_save_revisions.sql`, `tests/db/revisions.test.ts`.

**Dependencies**

- Q030: Consumes same-company source/quote/technical evidence and historical-reference validators.
- Q026: Consumes append-only history/source guards and protected identity columns.

**Planned verification (not run)**

- Focused deterministic checks for: Under the company lock recheck role/archive, validate company-qualified IDs/content/provenance and atomically append expectedRevision+1/update pointer/increment generation.
- Focused deterministic checks for: Request UUID in immutable operation metadata returns matching replay and rejects changed body; stale revision returns current revision without writing.
- Focused deterministic checks for: Review-only operations append history; edit/clear of approved content becomes unreviewed and edited leaves get user origin/supersedes while unchanged source/generated/inferred origins persist.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q034 — Assemble approved snapshot values in shared code

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Build the simple TypeScript preview assembler and canonical serializer.

Source: Revisions and publication transactions (L609–621); Stable paths and content provenance (L625–631).

**Acceptance criteria / scope in**

- Start with complete defaults, copy approved singleton objects and ordered people/offerings, exclude rejected values and retain coverage/rejection explanation; list unreviewed blockers and require at least one approved.
- Include only referenced active evidence/supporting claims, frozen metadata and bounded decisions; no page bodies, prompt/error logs, secrets or rejected sensitive candidates.
- Define canonical UTF-8 JSON serialization/hash and safe frozen-name ASCII download slug/fallback; stable entry creation order with ID tie-breaker.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/knowledge/assemble.ts`, `src/knowledge/canonical-json.ts`, `src/knowledge/download-name.ts`, `tests/knowledge/assembly.test.ts`.

Touches: `src/knowledge/assemble.ts`, `src/knowledge/canonical-json.ts`, `src/knowledge/download-name.ts`, `tests/knowledge/assembly.test.ts`.

**Dependencies**

- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.

**Planned verification (not run)**

- Focused deterministic checks for: Start with complete defaults, copy approved singleton objects and ordered people/offerings, exclude rejected values and retain coverage/rejection explanation; list unreviewed blockers and require at least one approved.
- Focused deterministic checks for: Include only referenced active evidence/supporting claims, frozen metadata and bounded decisions; no page bodies, prompt/error logs, secrets or rejected sensitive candidates.
- Focused deterministic checks for: Define canonical UTF-8 JSON serialization/hash and safe frozen-name ASCII download slug/fallback; stable entry creation order with ID tie-breaker.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q035 — Assemble and validate snapshot payloads in SQL

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement the small protected SQL assembler with TypeScript parity.

Source: Revisions and publication transactions (L614–619); Relationships and historical integrity (L409–413); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Copy five singleton objects/two ordered arrays over generated defaults and aggregate only approved revision evidence/coverage plus frozen company/source metadata.
- Validate company/manifest/source/claim/origin/limit consistency and canonical digest parity with TypeScript; snapshots cannot be browser-authored payloads.
- Snapshot insert trigger checks approved immutable manifest revisions and payload/digest consistency; old snapshots remain schema-versioned and untouched.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0011_assemble_snapshot.sql`, `tests/db/snapshot-assembly.test.ts`.

Touches: `supabase/migrations/0011_assemble_snapshot.sql`, `tests/db/snapshot-assembly.test.ts`.

**Dependencies**

- Q030: Consumes same-company source/quote/technical evidence and historical-reference validators.
- Q034: Consumes default-complete TypeScript preview assembler, canonical serializer and safe slug.
- Q027: Consumes generated versioned SQL defaults and validation-field parity artifact.

**Planned verification (not run)**

- Focused deterministic checks for: Copy five singleton objects/two ordered arrays over generated defaults and aggregate only approved revision evidence/coverage plus frozen company/source metadata.
- Focused deterministic checks for: Validate company/manifest/source/claim/origin/limit consistency and canonical digest parity with TypeScript; snapshots cannot be browser-authored payloads.
- Focused deterministic checks for: Snapshot insert trigger checks approved immutable manifest revisions and payload/digest consistency; old snapshots remain schema-versioned and untouched.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q036 — Publish snapshots atomically under generation checks

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement publish_knowledge_base with locked counters and request replay.

Source: Revisions and publication transactions (L609–621); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Lock company, require owner/editor/unarchived and expectedGeneration, include all current entry states and block any unreviewed entry or zero approvals.
- Allocate UUID/time and next_snapshot_version atomically, freeze manifest/payload/digest and increment counter in the same transaction without network/model calls.
- Matching replay returns the saved snapshot before stale-generation recheck; conflicting key/body fails and a later edit cannot alter saved payload.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0012_publish.sql`, `tests/db/publish.test.ts`.

Touches: `supabase/migrations/0012_publish.sql`, `tests/db/publish.test.ts`.

**Dependencies**

- Q035: Consumes protected SQL approved-manifest assembler and frozen-payload parity validation.
- Q033: Consumes company-locked save_entry_revision, generation checks and request replay.

**Planned verification (not run)**

- Focused deterministic checks for: Lock company, require owner/editor/unarchived and expectedGeneration, include all current entry states and block any unreviewed entry or zero approvals.
- Focused deterministic checks for: Allocate UUID/time and next_snapshot_version atomically, freeze manifest/payload/digest and increment counter in the same transaction without network/model calls.
- Focused deterministic checks for: Matching replay returns the saved snapshot before stale-generation recheck; conflicting key/body fails and a later edit cannot alter saved payload.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q037 — Wire verified Supabase sessions

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Add server/browser clients and protected layout without elevated user operations.

Source: Permissions (L419–426); API and background-job contracts (L546–546); Setup required before implementation and release (L1478–1478).

**Acceptance criteria / scope in**

- Server verifies session/user using supported Supabase Auth methods; browser receives only publishable config and its session, with appropriate Secure/HttpOnly cookies.
- Sign-in/sign-out/callback and authenticated navigation honor configured Auth method/redirects; no decoded-only JWT trust or browser user-author IDs.
- User SQL calls use caller JWT and RLS; server-only secret/config modules cannot enter client bundles.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/config/server.ts`, `src/app/auth/callback/route.ts`, `src/app/(authenticated)/layout.tsx`, `src/components/sign-in-form.tsx`, `tests/auth/session.test.ts`.

Touches: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/config/server.ts`, `src/app/auth/callback/route.ts`, `src/app/(authenticated)/layout.tsx`, `src/components/sign-in-form.tsx`, `tests/auth/session.test.ts`, `src/app/sign-in/page.tsx`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.
- Q022: Consumes branded app/sign-in shell, BEM style blocks and fixture editor surface. Also consumes prior contents of src/app/sign-in/page.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: Server verifies session/user using supported Supabase Auth methods; browser receives only publishable config and its session, with appropriate Secure/HttpOnly cookies.
- Focused deterministic checks for: Sign-in/sign-out/callback and authenticated navigation honor configured Auth method/redirects; no decoded-only JWT trust or browser user-author IDs.
- Focused deterministic checks for: User SQL calls use caller JWT and RLS; server-only secret/config modules cannot enter client bundles.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q038 — Implement shared safe route boundaries

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Create Node route helpers for verified auth, validation, origins, limits and typed errors.

Source: Network and rendering security (L98–98); API and background-job contracts (L546–546); API and background-job contracts (L599–599).

**Acceptance criteria / scope in**

- Validate IDs/query/body/response with strict schemas and bounded JSON size; writes enforce trusted origin/CSRF rules and tenant reads use private/no-store caching.
- Use {data,error,requestId}; map 400/401/404/403/409/422/429/503 with generic unavailable for cross-tenant IDs and sanitized actionable messages.
- No helper accepts arbitrary author authority, runs a user mutation with elevated credentials or starts background work after response.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/server/http.ts`, `src/server/authorize.ts`, `src/contracts/api-common.ts`, `tests/server/http.test.ts`.

Touches: `src/server/http.ts`, `src/server/authorize.ts`, `src/contracts/api-common.ts`, `tests/server/http.test.ts`.

**Dependencies**

- Q037: Consumes verified caller session and JWT-bound server/browser clients.
- Q005: Consumes strict UUID/URL/date/instant and reusable nested value types.

**Planned verification (not run)**

- Focused deterministic checks for: Validate IDs/query/body/response with strict schemas and bounded JSON size; writes enforce trusted origin/CSRF rules and tenant reads use private/no-store caching.
- Focused deterministic checks for: Use {data,error,requestId}; map 400/401/404/403/409/422/429/503 with generic unavailable for cross-tenant IDs and sanitized actionable messages.
- Focused deterministic checks for: No helper accepts arbitrary author authority, runs a user mutation with elevated credentials or starts background work after response.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q039 — Expose company creation and scoped listing

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Add GET/POST company routes for atomic ownership and bounded summaries.

Source: API and background-job contracts (L550–551); Dashboard at `/dashboard` (L188–190).

**Acceptance criteria / scope in**

- POST validates name/website/request ID and calls create_company as caller, returning companyId/owner; retries preserve SQL semantics.
- GET cursor returns only accessible unarchived company name/website/role/latest job/latest version summaries with no cross-company search.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/route.ts`, `src/contracts/api-companies.ts`, `tests/api/companies.test.ts`.

Touches: `src/app/api/companies/route.ts`, `src/contracts/api-companies.ts`, `tests/api/companies.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q031: Consumes atomic create_company and creation request replay/rollback behavior.

**Planned verification (not run)**

- Focused deterministic checks for: POST validates name/website/request ID and calls create_company as caller, returning companyId/owner; retries preserve SQL semantics.
- Focused deterministic checks for: GET cursor returns only accessible unarchived company name/website/role/latest job/latest version summaries with no cross-company search.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q040 — Expose company-qualified draft and save routes

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Add draft, entry creation and revision endpoints for the manual path.

Source: API and background-job contracts (L558–560).

**Acceptance criteria / scope in**

- GET draft returns current generation/entries/provenance/coverage through company-qualified reads; POST entries and revisions call protected functions with validated bodies.
- Respect viewer denial, stale 409/current revision and immutable request replay without frontend-only duplicate protection; preserve safe errors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/[companyId]/draft/route.ts`, `src/app/api/companies/[companyId]/entries/route.ts`, `src/app/api/companies/[companyId]/entries/[entryId]/revisions/route.ts`, `src/contracts/api-entries.ts`, `tests/api/draft.test.ts`.

Touches: `src/app/api/companies/[companyId]/draft/route.ts`, `src/app/api/companies/[companyId]/entries/route.ts`, `src/app/api/companies/[companyId]/entries/[entryId]/revisions/route.ts`, `src/contracts/api-entries.ts`, `tests/api/draft.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q033: Consumes company-locked save_entry_revision, generation checks and request replay.
- Q032: Consumes atomic protected identity/revision1 creation and creation replay contract.

**Planned verification (not run)**

- Focused deterministic checks for: GET draft returns current generation/entries/provenance/coverage through company-qualified reads; POST entries and revisions call protected functions with validated bodies.
- Focused deterministic checks for: Respect viewer denial, stale 409/current revision and immutable request replay without frontend-only duplicate protection; preserve safe errors.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q041 — Expose preview, publication and saved JSON download

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Add the preview/publish/list/read/download routes over stored snapshots.

Source: API and background-job contracts (L565–569); Revisions and publication transactions (L621–621).

**Acceptance criteria / scope in**

- Server preview returns generation/payloadPreview/blockers without inventing final UUID/time/version; POST versions accepts generation/request ID and protected publish.
- List/read/download use company and saved version ID; read stored payload exclusively and validate output without reconstructing current records.
- Attachment is canonical UTF-8 application/json with frozen-name safe ASCII filename/fallback; viewer can read/download and cannot publish.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/[companyId]/preview/route.ts`, `src/app/api/companies/[companyId]/versions/route.ts`, `src/app/api/companies/[companyId]/versions/[versionId]/route.ts`, `src/app/api/companies/[companyId]/versions/[versionId]/download/route.ts`, `src/contracts/api-versions.ts`, `tests/api/versions.test.ts`.

Touches: `src/app/api/companies/[companyId]/preview/route.ts`, `src/app/api/companies/[companyId]/versions/route.ts`, `src/app/api/companies/[companyId]/versions/[versionId]/route.ts`, `src/app/api/companies/[companyId]/versions/[versionId]/download/route.ts`, `src/contracts/api-versions.ts`, `tests/api/versions.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q036: Consumes atomic publish_knowledge_base, expected generation and locked version allocator.
- Q034: Consumes default-complete TypeScript preview assembler, canonical serializer and safe slug.

**Planned verification (not run)**

- Focused deterministic checks for: Server preview returns generation/payloadPreview/blockers without inventing final UUID/time/version; POST versions accepts generation/request ID and protected publish.
- Focused deterministic checks for: List/read/download use company and saved version ID; read stored payload exclusively and validate output without reconstructing current records.
- Focused deterministic checks for: Attachment is canonical UTF-8 application/json with frozen-name safe ASCII filename/fallback; viewer can read/download and cannot publish.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q042 — Build dashboard and company switching

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Show company summaries and a small creation form with explicit scoped navigation.

Source: Dashboard at `/dashboard` (L188–190).

**Acceptance criteria / scope in**

- Server loads accessible unarchived summaries, empty state and display-name/website creation form; switcher preserves explicit companyId navigation.
- Company role/latest job/latest snapshot appear; client cannot infer tenancy from context alone and signed-out/nonmember data never renders.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/(authenticated)/dashboard/page.tsx`, `src/components/company-dashboard.tsx`, `src/components/company-switcher.tsx`, `tests/ui/dashboard.test.tsx`.

Touches: `src/app/(authenticated)/dashboard/page.tsx`, `src/components/company-dashboard.tsx`, `src/components/company-switcher.tsx`, `tests/ui/dashboard.test.tsx`.

**Dependencies**

- Q039: Consumes scoped company summaries and atomic creation endpoint.
- Q037: Consumes verified caller session and JWT-bound server/browser clients.

**Planned verification (not run)**

- Focused deterministic checks for: Server loads accessible unarchived summaries, empty state and display-name/website creation form; switcher preserves explicit companyId navigation.
- Focused deterministic checks for: Company role/latest job/latest snapshot appear; client cannot infer tenancy from context alone and signed-out/nonmember data never renders.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q043 — Create company-scoped draft state

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement a small reducer/context with explicit save boundaries and stale preservation.

Source: Fixed decisions and verification gates (L27–27); Scrape and Build at `/knowledge?companyId=...` (L194–198); Revisions and publication transactions (L607–607).

**Acceptance criteria / scope in**

- Server initial draft feeds company-scoped reducer/context for edits/category/filter/poll state; changing company resets scope safely.
- Keystrokes remain local, explicit saves persist; refresh restores saved draft, unsaved navigation warns and stale 409 retains edits for manual comparison.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/editor-context.tsx`, `src/components/knowledge/editor-reducer.ts`, `tests/ui/editor-state.test.ts`.

Touches: `src/components/knowledge/editor-context.tsx`, `src/components/knowledge/editor-reducer.ts`, `tests/ui/editor-state.test.ts`.

**Dependencies**

- Q040: Consumes company-qualified current drafts, initial entries and revision HTTP operations.
- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.

**Planned verification (not run)**

- Focused deterministic checks for: Server initial draft feeds company-scoped reducer/context for edits/category/filter/poll state; changing company resets scope safely.
- Focused deterministic checks for: Keystrokes remain local, explicit saves persist; refresh restores saved draft, unsaved navigation warns and stale 409 retains edits for manual comparison.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q044 — Deliver the manual foundation entry path

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Build a simple typed foundation form and save/review controls.

Source: Scrape and Build at `/knowledge?companyId=...` (L194–198); Phase 1 Company isolation and a manual end-to-end path (L1388–1392).

**Acceptance criteria / scope in**

- Foundation form can create/save/approve an entry with complete nullable keys and honest user-provided actor/time/note provenance; unknowns do not block approval.
- Show generation/origin, save/approve/reject/stale states; viewer controls are disabled and server denial remains authoritative.
- Knowledge page opens companyId-scoped server draft with seven category tabs/default placeholders, while advanced category editing is delivered separately.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/(authenticated)/knowledge/page.tsx`, `src/components/knowledge/foundation-form.tsx`, `src/components/knowledge/entry-actions.tsx`, `src/components/knowledge/manual-editor.tsx`, `tests/ui/manual-editor.test.tsx`.

Touches: `src/app/(authenticated)/knowledge/page.tsx`, `src/components/knowledge/foundation-form.tsx`, `src/components/knowledge/entry-actions.tsx`, `src/components/knowledge/manual-editor.tsx`, `tests/ui/manual-editor.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q042: Consumes accessible-company dashboard and explicit company switcher navigation.
- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.

**Planned verification (not run)**

- Focused deterministic checks for: Foundation form can create/save/approve an entry with complete nullable keys and honest user-provided actor/time/note provenance; unknowns do not block approval.
- Focused deterministic checks for: Show generation/origin, save/approve/reject/stale states; viewer controls are disabled and server denial remains authoritative.
- Focused deterministic checks for: Knowledge page opens companyId-scoped server draft with seven category tabs/default placeholders, while advanced category editing is delivered separately.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q045 — Deliver manual preview and saved download

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Add a minimal generation-aware publication panel to complete the Phase 1 path.

Source: Scrape and Build at `/knowledge?companyId=...` (L202–202); Phase 1 Company isolation and a manual end-to-end path (L1390–1392).

**Acceptance criteria / scope in**

- Panel displays approved/rejected/unresolved counts and server payload preview, then submits expected generation/request ID to publish.
- Stale preview requires refresh; saved version ID produces download of valid seven-category JSON with defaults; snapshot history has no edit/delete action.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/versions/publish-panel.tsx`, `tests/ui/publish-panel.test.tsx`.

Touches: `src/components/versions/publish-panel.tsx`, `tests/ui/publish-panel.test.tsx`, `src/components/knowledge/manual-editor.tsx`.

**Dependencies**

- Q041: Consumes server preview and stored-version publication/list/read/download HTTP contract.
- Q044: Consumes manual foundation form, review actions and company-scoped knowledge page. Also consumes prior contents of src/components/knowledge/manual-editor.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: Panel displays approved/rejected/unresolved counts and server payload preview, then submits expected generation/request ID to publish.
- Focused deterministic checks for: Stale preview requires refresh; saved version ID produces download of valid seven-category JSON with defaults; snapshot history has no edit/delete action.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q046 — Prove the two-tenant manual lifecycle

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Add focused integration coverage for manual isolation, immutable revisions and snapshot stability.

Source: Phase 1 Company isolation and a manual end-to-end path (L1392–1392); Focused test inventory (L1438–1440).

**Acceptance criteria / scope in**

- Prove atomic company/owner rollback, anon/nonmember and viewer table/RPC denial across jobs/sources/entries/revisions/snapshots, plus forged tenant JSON rejection.
- Manual create/save/approve/publish/download passes strict full schema; later edit increments revision, resets approval and leaves saved canonical payload unchanged.
- Assert default empty/rejected singleton schema, at least one approval and unreviewed blockers; no placeholder authorization or live-model dependency.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/integration/manual-path.test.ts`, `tests/integration/tenant-boundaries.test.ts`.

Touches: `tests/integration/manual-path.test.ts`, `tests/integration/tenant-boundaries.test.ts`.

**Dependencies**

- Q045: Consumes generation-aware preview/publish/download panel in the manual editor.
- Q026: Consumes append-only history/source guards and protected identity columns.
- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.
- Q030: Consumes same-company source/quote/technical evidence and historical-reference validators.

**Planned verification (not run)**

- Focused deterministic checks for: Prove atomic company/owner rollback, anon/nonmember and viewer table/RPC denial across jobs/sources/entries/revisions/snapshots, plus forged tenant JSON rejection.
- Focused deterministic checks for: Manual create/save/approve/publish/download passes strict full schema; later edit increments revision, resets approval and leaves saved canonical payload unchanged.
- Focused deterministic checks for: Assert default empty/rejected singleton schema, at least one approval and unreviewed blockers; no placeholder authorization or live-model dependency.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

## Phase 2: Durable bounded scraping

Acceptance gate (Q070, Q071, Q069): URL submission persists progress and yields reviewable deterministic foundation evidence; restart/cancel/lease/network protections hold.

Phase completion requires these outcome checks and relevant required deliverables; do not add blanket all-phase dependency edges. Local fixtures do not close live setup gates.

Phase-entry work with only earlier-phase inputs: Q047, Q052

### Q047 — Enqueue and cancel company jobs atomically

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement protected owner/editor enqueue and cooperative cancellation.

Source: Crawl policy and real progress (L64–78); API and background-job contracts (L555–557); API and background-job contracts (L597–599); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Enqueue validates URL syntax/scope/options and configured user/company scrape limits under company lock, derives requester and enforces max 25 documents/depth 3.
- Matching request replay returns same job; changed body conflicts; one active company job returns accessible active ID with 409.
- Cancel records cooperative request, preserves finalized sources and never imports unfinished proposals; archived/removed requester cannot enqueue/cancel unauthorized work.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0013_job_control.sql`, `tests/db/job-control.test.ts`.

Touches: `supabase/migrations/0013_job_control.sql`, `tests/db/job-control.test.ts`.

**Dependencies**

- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.
- Q031: Consumes atomic create_company and creation request replay/rollback behavior.
- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.

**Planned verification (not run)**

- Focused deterministic checks for: Enqueue validates URL syntax/scope/options and configured user/company scrape limits under company lock, derives requester and enforces max 25 documents/depth 3.
- Focused deterministic checks for: Matching request replay returns same job; changed body conflicts; one active company job returns accessible active ID with 409.
- Focused deterministic checks for: Cancel records cooperative request, preserves finalized sources and never imports unfinished proposals; archived/removed requester cannot enqueue/cancel unauthorized work.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q048 — Claim and reclaim jobs with lease fencing

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement private claim_job and heartbeat_job under restricted worker execution.

Source: Crawl policy and real progress (L78–78); Protected functions and trust boundaries (L542–542); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- SKIP LOCKED claim commits before I/O, creates lease token/60-second expiry, increments bounded attempt count and returns checkpoint; one claimed job per worker process.
- 15-second heartbeat requires current unexpired token; expired work can resume at most three attempts, while exhausted jobs reach explicit failure.
- Private functions authorize restricted worker login with no direct table grants and recheck stored requester membership/archive before work; no caller-selected author.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0014_claim_heartbeat.sql`, `tests/db/job-leases.test.ts`.

Touches: `supabase/migrations/0014_claim_heartbeat.sql`, `tests/db/job-leases.test.ts`.

**Dependencies**

- Q047: Consumes protected enqueue/cancel and relational active-job/idempotency checks.

**Planned verification (not run)**

- Focused deterministic checks for: SKIP LOCKED claim commits before I/O, creates lease token/60-second expiry, increments bounded attempt count and returns checkpoint; one claimed job per worker process.
- Focused deterministic checks for: 15-second heartbeat requires current unexpired token; expired work can resume at most three attempts, while exhausted jobs reach explicit failure.
- Focused deterministic checks for: Private functions authorize restricted worker login with no direct table grants and recheck stored requester membership/archive before work; no caller-selected author.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q049 — Persist fenced job checkpoints and failure state

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement checkpoint_job/fail_job with safe progress and terminal transitions.

Source: Proposed table definitions (L398–398); Protected functions and trust boundaries (L542–542); API and background-job contracts (L573–599); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Checkpoint validates current unexpired company-qualified token, requester role/archive, typed frontier/budgets/outcomes/extraction IDs and safe counts.
- Fail/cancel transitions set finished_at consistently, redact safe errors and reject stale workers; checkpoint resumes persisted stage and completed captures.
- Only normal queued/validating/crawling/extracting and defined terminal transitions are accepted; no fake overall percentage.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0015_checkpoint_fail.sql`, `tests/db/job-checkpoints.test.ts`.

Touches: `supabase/migrations/0015_checkpoint_fail.sql`, `tests/db/job-checkpoints.test.ts`.

**Dependencies**

- Q048: Consumes restricted-worker claim_job/heartbeat_job and unexpired lease fencing.
- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.

**Planned verification (not run)**

- Focused deterministic checks for: Checkpoint validates current unexpired company-qualified token, requester role/archive, typed frontier/budgets/outcomes/extraction IDs and safe counts.
- Focused deterministic checks for: Fail/cancel transitions set finished_at consistently, redact safe errors and reject stale workers; checkpoint resumes persisted stage and completed captures.
- Focused deterministic checks for: Only normal queued/validating/crawling/extracting and defined terminal transitions are accepted; no fake overall percentage.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q050 — Insert finalized captures once

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement private insert_source_capture with lease and source contract validation.

Source: Proposed table definitions (L299–330); Relationships and historical integrity (L411–413); Protected functions and trust boundaries (L542–542); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Lease/requester/archive checks precede immutable finalized insert; browser augmentation completes before row insertion, including bounded text/hash/segments/observations.
- Same company/job/normalized URL reuses a matching finalized row rather than mutating it; cross-company IDs and incompatible retries fail.
- Record requested/final URL, redirect trace and observed dates/author without inventing metadata; captured/blocked/failed/unsupported outcomes meet table checks.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0016_insert_source.sql`, `tests/db/source-captures.test.ts`.

Touches: `supabase/migrations/0016_insert_source.sql`, `tests/db/source-captures.test.ts`.

**Dependencies**

- Q048: Consumes restricted-worker claim_job/heartbeat_job and unexpired lease fencing.
- Q030: Consumes same-company source/quote/technical evidence and historical-reference validators.
- Q026: Consumes append-only history/source guards and protected identity columns.

**Planned verification (not run)**

- Focused deterministic checks for: Lease/requester/archive checks precede immutable finalized insert; browser augmentation completes before row insertion, including bounded text/hash/segments/observations.
- Focused deterministic checks for: Same company/job/normalized URL reuses a matching finalized row rather than mutating it; cross-company IDs and incompatible retries fail.
- Focused deterministic checks for: Record requested/final URL, redirect trace and observed dates/author without inventing metadata; captured/blocked/failed/unsupported outcomes meet table checks.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q051 — Finalize proposals and first import atomically

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement finish_job and all-or-nothing initial entry import.

Source: End-to-end flow (L55–57); API and background-job contracts (L597–597); Protected functions and trust boundaries (L542–542); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Under company lock validate current lease, requester role/archive and typed proposals/evidence; terminal transaction is idempotent and cannot import cancelled/incomplete results.
- Only an entirely entry-empty company initializes five unreviewed singletons plus separate nonempty person/offering entries with requester authorship and stable IDs; any human-created entry makes whole job proposal-only.
- Store proposals without overwriting entries; classify succeeded/partial/failed from usable validated results and affected coverage, preserving finalized sources.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0017_finish_import.sql`, `tests/db/first-import.test.ts`.

Touches: `supabase/migrations/0017_finish_import.sql`, `tests/db/first-import.test.ts`.

**Dependencies**

- Q049: Consumes checkpoint_job/fail_job with typed stages, progress and cancellation state.
- Q050: Consumes insert_source_capture with fenced immutable normalized-URL uniqueness.
- Q033: Consumes company-locked save_entry_revision, generation checks and request replay.
- Q032: Consumes atomic protected identity/revision1 creation and creation replay contract.

**Planned verification (not run)**

- Focused deterministic checks for: Under company lock validate current lease, requester role/archive and typed proposals/evidence; terminal transaction is idempotent and cannot import cancelled/incomplete results.
- Focused deterministic checks for: Only an entirely entry-empty company initializes five unreviewed singletons plus separate nonempty person/offering entries with requester authorship and stable IDs; any human-created entry makes whole job proposal-only.
- Focused deterministic checks for: Store proposals without overwriting entries; classify succeeded/partial/failed from usable validated results and affected coverage, preserving finalized sources.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q052 — Normalize URLs and constrain document scope

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement WHATWG normalization and offline public-suffix redirect scope.

Source: Crawl policy and real progress (L68–70).

**Acceptance criteria / scope in**

- Allow HTTP(S), no credentials, ports 80/443, case/IDNA/default-port normalization, fragment/tracking removal and sorted meaningful queries; reject IP literals/localhost/single-label submissions.
- Preserve trailing slash/meaningful query distinctions until verified redirect; only validated bare/www registrable pair aliases, exact scope for hosted subdomains.
- Maximum five manual redirects, revalidate every target and establish effective root after initial redirect; rel=canonical is metadata only and off-host documents fail scope.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/network/url-scope.ts`, `tests/worker/url-scope.test.ts`.

Touches: `src/worker/network/url-scope.ts`, `tests/worker/url-scope.test.ts`.

**Dependencies**

- Q005: Consumes strict UUID/URL/date/instant and reusable nested value types.

**Planned verification (not run)**

- Focused deterministic checks for: Allow HTTP(S), no credentials, ports 80/443, case/IDNA/default-port normalization, fragment/tracking removal and sorted meaningful queries; reject IP literals/localhost/single-label submissions.
- Focused deterministic checks for: Preserve trailing slash/meaningful query distinctions until verified redirect; only validated bare/www registrable pair aliases, exact scope for hosted subdomains.
- Focused deterministic checks for: Maximum five manual redirects, revalidate every target and establish effective root after initial redirect; rel=canonical is metadata only and off-host documents fail scope.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q053 — Reject non-global DNS destinations

feature · Rank C · 35 min estimate · gpt-6.1-sol / high effort

Implement maintained-library IP classification and all-answer DNS policy.

Source: Network and rendering security (L94–96).

**Acceptance criteria / scope in**

- Validate every A/AAAA answer; deny private, loopback, link-local, multicast, unspecified, reserved/non-global, CGNAT and mapped private IPv6; any mixed answer set fails.
- Return approved addresses separately from host/TLS identity and revalidate every new connection; tests cover representative special forms and rebinding answer changes.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/network/destination-policy.ts`, `tests/security/destination-policy.test.ts`.

Touches: `src/worker/network/destination-policy.ts`, `tests/security/destination-policy.test.ts`.

**Dependencies**

- Q001: Consumes pinned package/compiler environment and documented command entry points.
- Q052: Consumes WHATWG URL normalization, allowed document host pair and redirect scope.

**Planned verification (not run)**

- Focused deterministic checks for: Validate every A/AAAA answer; deny private, loopback, link-local, multicast, unspecified, reserved/non-global, CGNAT and mapped private IPv6; any mixed answer set fails.
- Focused deterministic checks for: Return approved addresses separately from host/TLS identity and revalidate every new connection; tests cover representative special forms and rebinding answer changes.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q054 — Connect only to approved IP addresses

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement bounded HTTP transport with pinned dial and correct TLS hostname checks.

Source: Network and rendering security (L94–96); Crawl policy and real progress (L64–72).

**Acceptance criteria / scope in**

- Dial only DNS-policy-approved IP while preserving Host/SNI/certificate hostname verification; no library fallback lookup or automatic redirect escape.
- Apply connect/read deadlines, abort and streamed decoded-body ceilings for GET/HEAD; each redirect/new connection re-enters scope/network policy.
- Tests prove changed DNS cannot switch connected address and redirects to internal/mixed/special addresses fail before connection.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/network/pinned-transport.ts`, `tests/security/pinned-transport.test.ts`.

Touches: `src/worker/network/pinned-transport.ts`, `tests/security/pinned-transport.test.ts`.

**Dependencies**

- Q053: Consumes all-answer public-address classification including mapped IPv6 and rebinding rejection.
- Q052: Consumes WHATWG URL normalization, allowed document host pair and redirect scope.

**Planned verification (not run)**

- Focused deterministic checks for: Dial only DNS-policy-approved IP while preserving Host/SNI/certificate hostname verification; no library fallback lookup or automatic redirect escape.
- Focused deterministic checks for: Apply connect/read deadlines, abort and streamed decoded-body ceilings for GET/HEAD; each redirect/new connection re-enters scope/network policy.
- Focused deterministic checks for: Tests prove changed DNS cannot switch connected address and redirects to internal/mixed/special addresses fail before connection.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q055 — Implement the enforced destination proxy

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Provide the renderer-facing public-only outbound proxy using the pinned connection policy.

Source: Components (L44–48); Network and rendering security (L94–96).

**Acceptance criteria / scope in**

- Authenticated private proxy admits only constrained HTTP(S) destinations/ports and uses destination policy plus pinned connections; plaintext resource methods are bounded GET/HEAD.
- Reject malformed requests, unsafe CONNECT targets, proxy recursion and private/internal/metadata destinations; cap connections/bytes/time and strip sensitive headers.
- Proxy is a separate minimal service endpoint with no database/model credentials; HTTP fetch and every browser resource use the same destination gate.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/egress/main.ts`, `src/egress/proxy.ts`, `tests/security/proxy.test.ts`.

Touches: `src/egress/main.ts`, `src/egress/proxy.ts`, `tests/security/proxy.test.ts`.

**Dependencies**

- Q054: Consumes bounded connection-to-approved-IP transport with Host/TLS identity preservation.
- Q004: Consumes private secret-free renderer and enforced-proxy host qualification contract.

**Planned verification (not run)**

- Focused deterministic checks for: Authenticated private proxy admits only constrained HTTP(S) destinations/ports and uses destination policy plus pinned connections; plaintext resource methods are bounded GET/HEAD.
- Focused deterministic checks for: Reject malformed requests, unsafe CONNECT targets, proxy recursion and private/internal/metadata destinations; cap connections/bytes/time and strip sensitive headers.
- Focused deterministic checks for: Proxy is a separate minimal service endpoint with no database/model credentials; HTTP fetch and every browser resource use the same destination gate.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q056 — Create the private renderer task interface

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Run a secret-free persistent renderer process with authenticated bounded tasks.

Source: Components (L44–48); Setup required before implementation and release (L1480–1480).

**Acceptance criteria / scope in**

- Renderer receives only explicit allowlisted runtime configuration, private task authentication and proxy connection settings; no inherited database/model secrets, session or host mounts.
- Private task input/output schemas bound URL/scope/time/resource budgets and return text/observations/errors; reject unauthenticated/oversized tasks.
- Fresh Chromium contexts close on success/failure/cancellation and honor 25-second timeout, sandbox and resource controls selected by qualified host.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/renderer/main.ts`, `src/renderer/task-server.ts`, `src/contracts/render-task.ts`, `tests/renderer/task-interface.test.ts`.

Touches: `src/renderer/main.ts`, `src/renderer/task-server.ts`, `src/contracts/render-task.ts`, `tests/renderer/task-interface.test.ts`.

**Dependencies**

- Q055: Consumes private authenticated destination proxy that dials only approved public IPs.
- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.
- Q004: Consumes private secret-free renderer and enforced-proxy host qualification contract.

**Planned verification (not run)**

- Focused deterministic checks for: Renderer receives only explicit allowlisted runtime configuration, private task authentication and proxy connection settings; no inherited database/model secrets, session or host mounts.
- Focused deterministic checks for: Private task input/output schemas bound URL/scope/time/resource budgets and return text/observations/errors; reject unauthenticated/oversized tasks.
- Focused deterministic checks for: Fresh Chromium contexts close on success/failure/cancellation and honor 25-second timeout, sandbox and resource controls selected by qualified host.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q057 — Restrict browser navigation and resource loading

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement defense-in-depth browser policy over forced proxy egress.

Source: Network and rendering security (L94–98).

**Acceptance criteria / scope in**

- Allow bounded public HTTP(S) GET/HEAD through proxy only; block cross-host frame/document navigation, WebSockets, service workers, downloads, WebRTC and unsafe schemes/methods.
- Public CDN CSS/font/image resources may load through the gate and consume design budget; iframe/XHR/CSS imports/navigation all remain subject to network policy.
- Fresh context has no user session and does not click CTAs/forms, solve CAPTCHA or bypass auth/paywalls; interception tests are labeled application-layer only.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/renderer/browser-policy.ts`, `tests/renderer/browser-policy.test.ts`.

Touches: `src/renderer/browser-policy.ts`, `tests/renderer/browser-policy.test.ts`.

**Dependencies**

- Q056: Consumes bounded authenticated private render tasks and isolated renderer process contract.
- Q052: Consumes WHATWG URL normalization, allowed document host pair and redirect scope.

**Planned verification (not run)**

- Focused deterministic checks for: Allow bounded public HTTP(S) GET/HEAD through proxy only; block cross-host frame/document navigation, WebSockets, service workers, downloads, WebRTC and unsafe schemes/methods.
- Focused deterministic checks for: Public CDN CSS/font/image resources may load through the gate and consume design budget; iframe/XHR/CSS imports/navigation all remain subject to network policy.
- Focused deterministic checks for: Fresh context has no user session and does not click CTAs/forms, solve CAPTCHA or bypass auth/paywalls; interception tests are labeled application-layer only.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q058 — Qualify host-enforced renderer egress before arbitrary URLs

chore · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Add a non-Docker host qualification probe and evidence checklist.

Source: Fixed decisions and verification gates (L32–32); Network and rendering security (L94–96); Focused test inventory (L1445–1445); Material risks and controls (L1467–1467).

**Acceptance criteria / scope in**

- Selected host config must force renderer sockets through proxy and deny direct TCP/UDP/QUIC/DNS/internal application services even if page/application hooks are bypassed; run probes in the real host topology.
- Record sandbox/memory/restart/private-channel/public-CDN results and failure evidence; refuse arbitrary company URLs if required boundary is unavailable.
- A local sample/fixture render is separate from production confinement evidence; no successful test is claimed without exact environment/result and this gate remains unresolved until host setup exists.

**Scope out**

- Docker execution
- Network mocks as production proof
- Unrelated refactors and optional post-MVP features

**Files**

Creates: `scripts/qualify-renderer-host.mjs`, `docs/renderer-host-evidence.md`.

Touches: `scripts/qualify-renderer-host.mjs`, `docs/renderer-host-evidence.md`.

**Dependencies**

- Q057: Consumes fresh-context resource/navigation restrictions over forced proxy egress.
- Q004: Consumes private secret-free renderer and enforced-proxy host qualification contract.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.
- Q023: Consumes the preliminary configured-host compatibility record before real-topology confinement qualification; a sample render alone cannot close this gate.

**Planned verification (not run)**

- Focused deterministic checks for: Selected host config must force renderer sockets through proxy and deny direct TCP/UDP/QUIC/DNS/internal application services even if page/application hooks are bypassed; run probes in the real host topology.
- Focused deterministic checks for: Record sandbox/memory/restart/private-channel/public-CDN results and failure evidence; refuse arbitrary company URLs if required boundary is unavailable.
- Focused deterministic checks for: A local sample/fixture render is separate from production confinement evidence; no successful test is claimed without exact environment/result and this gate remains unresolved until host setup exists.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

Setup gate: `non_docker_host_qualification`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

### Q059 — Honor robots and bounded retry policy

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement origin robots rules and finite HTTP retry decisions.

Source: Crawl policy and real progress (L64–74); API and background-job contracts (L599–599).

**Acceptance criteria / scope in**

- Fetch robots per permitted origin through network gate with MoFloKnowledgeBot; respect disallow/rate guidance, 404 no rules and 401/403 blocked.
- Timeout/5xx retry once then skip indeterminate origin with limitation; bounded Retry-After for 429, no permanent-4xx retry, and no access-control bypass.
- Use deterministic clock/response fixtures for wait/abort/budget cases; no unbounded retries.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/crawl/robots.ts`, `src/worker/crawl/retry-policy.ts`, `tests/worker/robots-retries.test.ts`.

Touches: `src/worker/crawl/robots.ts`, `src/worker/crawl/retry-policy.ts`, `tests/worker/robots-retries.test.ts`.

**Dependencies**

- Q054: Consumes bounded connection-to-approved-IP transport with Host/TLS identity preservation.

**Planned verification (not run)**

- Focused deterministic checks for: Fetch robots per permitted origin through network gate with MoFloKnowledgeBot; respect disallow/rate guidance, 404 no rules and 401/403 blocked.
- Focused deterministic checks for: Timeout/5xx retry once then skip indeterminate origin with limitation; bounded Retry-After for 429, no permanent-4xx retry, and no access-control bypass.
- Focused deterministic checks for: Use deterministic clock/response fixtures for wait/abort/budget cases; no unbounded retries.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q060 — Prioritize and deduplicate the finite crawl frontier

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement same-host link discovery and budget-aware priority selection.

Source: Crawl policy and real progress (L64–74).

**Acceptance criteria / scope in**

- Start homepage; prioritize About/Product/Service/Pricing/Contact/FAQ/Team/Location/Brand from label/URL and enforce breadth/depth scope.
- Track at most 200 normalized candidates, deduplicate normalized URL/verified redirect aliases and preserve outcomes/checkpoint data.
- Defaults 10 documents/depth2 and admin max25/depth3; exceeding discovery/document/depth budgets records partial coverage, never complete.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/crawl/frontier.ts`, `tests/worker/frontier.test.ts`.

Touches: `src/worker/crawl/frontier.ts`, `tests/worker/frontier.test.ts`.

**Dependencies**

- Q052: Consumes WHATWG URL normalization, allowed document host pair and redirect scope.
- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.

**Planned verification (not run)**

- Focused deterministic checks for: Start homepage; prioritize About/Product/Service/Pricing/Contact/FAQ/Team/Location/Brand from label/URL and enforce breadth/depth scope.
- Focused deterministic checks for: Track at most 200 normalized candidates, deduplicate normalized URL/verified redirect aliases and preserve outcomes/checkpoint data.
- Focused deterministic checks for: Defaults 10 documents/depth2 and admin max25/depth3; exceeding discovery/document/depth budgets records partial coverage, never complete.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q061 — Reserve crawl budgets before dispatch

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement one coordinator with bounded asynchronous concurrency and host pacing.

Source: Crawl policy and real progress (L64–74).

**Acceptance criteria / scope in**

- Atomically reserve page/depth/decoded-byte/design budgets before dispatch; three HTTP page tasks, one render and >=500 ms request-start gap per host or stricter robots interval.
- Enforce 15-second fetch,25-second render,5-minute job,2MiB decoded HTML,100000 cleaned chars/page,15MiB total design resources; abort/release reservations consistently.
- Budget/time/cancel decisions yield safe explicit limitations; no CPU worker-thread framework or unmeasured parallelism.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/crawl/budgets.ts`, `src/worker/crawl/scheduler.ts`, `tests/worker/budgets.test.ts`.

Touches: `src/worker/crawl/budgets.ts`, `src/worker/crawl/scheduler.ts`, `tests/worker/budgets.test.ts`.

**Dependencies**

- Q060: Consumes bounded normalized priority frontier and verified redirect deduplication.
- Q059: Consumes robots rules, host-rate guidance and finite fetch retry decisions.

**Planned verification (not run)**

- Focused deterministic checks for: Atomically reserve page/depth/decoded-byte/design budgets before dispatch; three HTTP page tasks, one render and >=500 ms request-start gap per host or stricter robots interval.
- Focused deterministic checks for: Enforce 15-second fetch,25-second render,5-minute job,2MiB decoded HTML,100000 cleaned chars/page,15MiB total design resources; abort/release reservations consistently.
- Focused deterministic checks for: Budget/time/cancel decisions yield safe explicit limitations; no CPU worker-thread framework or unmeasured parallelism.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q062 — Extract sanitized text and observed metadata

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Convert bounded HTML into plain text segments and deterministic observations.

Source: Capture and extraction (L82–82); Proposed table definitions (L398–398).

**Acceptance criteria / scope in**

- Extract title/observed author/publisher/date, headings/main text, JSON-LD/meta, visible link labels, forms/CTAs without submission, price/address text and social anchors.
- Remove scripts/event handlers/executable markup/hidden boilerplate; preserve meaningful wording/punctuation and stable segment IDs for exact quote verification.
- Record normalized/final URLs and redirect/canonical metadata, hash final bounded content and identify script-shell/client-rendered sections without inventing facts.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/capture/html.ts`, `src/worker/capture/segments.ts`, `tests/worker/html-capture.test.ts`.

Touches: `src/worker/capture/html.ts`, `src/worker/capture/segments.ts`, `tests/worker/html-capture.test.ts`.

**Dependencies**

- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.
- Q052: Consumes WHATWG URL normalization, allowed document host pair and redirect scope.
- Q016: Consumes controlled HTML/CSS/JS company pages and expected evidence manifest.

**Planned verification (not run)**

- Focused deterministic checks for: Extract title/observed author/publisher/date, headings/main text, JSON-LD/meta, visible link labels, forms/CTAs without submission, price/address text and social anchors.
- Focused deterministic checks for: Remove scripts/event handlers/executable markup/hidden boilerplate; preserve meaningful wording/punctuation and stable segment IDs for exact quote verification.
- Focused deterministic checks for: Record normalized/final URLs and redirect/canonical metadata, hash final bounded content and identify script-shell/client-rendered sections without inventing facts.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q063 — Capture rendered text and raw style observations

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement homepage rendering and selective JS-content fallback.

Source: Capture and extraction (L84–86).

**Acceptance criteria / scope in**

- Render homepage for required design evidence and other pages only for missing/script-shell/required client sections; capture final visible bounded segments.
- Capture heading/body/button/background computed properties, bounded stylesheet declarations/responses, font resource loads and logo candidates separately, with selectors/evidence IDs.
- Cross-origin CSSOM failure yields captured stylesheet evidence or honest unavailable status; optional render finishes before source finalization and no SVG code is exported.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/renderer/capture.ts`, `tests/renderer/capture.test.ts`.

Touches: `src/renderer/capture.ts`, `tests/renderer/capture.test.ts`.

**Dependencies**

- Q057: Consumes fresh-context resource/navigation restrictions over forced proxy egress.
- Q062: Consumes sanitized visible text segments, metadata and structured link/CTA observations.
- Q061: Consumes atomic document/depth/byte/time reservations and HTTP/render semaphores.

**Planned verification (not run)**

- Focused deterministic checks for: Render homepage for required design evidence and other pages only for missing/script-shell/required client sections; capture final visible bounded segments.
- Focused deterministic checks for: Capture heading/body/button/background computed properties, bounded stylesheet declarations/responses, font resource loads and logo candidates separately, with selectors/evidence IDs.
- Focused deterministic checks for: Cross-origin CSSOM failure yields captured stylesheet evidence or honest unavailable status; optional render finishes before source finalization and no SVG code is exported.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q064 — Wrap restricted job SQL operations

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Implement the worker database adapter for only permitted private functions.

Source: Protected functions and trust boundaries (L542–542); API and background-job contracts (L591–595); Setup required before implementation and release (L1480–1480).

**Acceptance criteria / scope in**

- Worker calls only claim/heartbeat/insert/checkpoint/finish/fail using explicit company/token; connection credentials are server-only and short transactions release before I/O.
- Adapter parses returned contracts and sanitizes database errors; no direct table grant, arbitrary requester or service-role authorization substitute.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/job-repository.ts`, `tests/worker/job-repository.test.ts`.

Touches: `src/worker/job-repository.ts`, `tests/worker/job-repository.test.ts`.

**Dependencies**

- Q051: Consumes finish_job and atomic all-or-nothing empty-company initial import.
- Q049: Consumes checkpoint_job/fail_job with typed stages, progress and cancellation state.
- Q050: Consumes insert_source_capture with fenced immutable normalized-URL uniqueness.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.

**Planned verification (not run)**

- Focused deterministic checks for: Worker calls only claim/heartbeat/insert/checkpoint/finish/fail using explicit company/token; connection credentials are server-only and short transactions release before I/O.
- Focused deterministic checks for: Adapter parses returned contracts and sanitizes database errors; no direct table grant, arbitrary requester or service-role authorization substitute.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q065 — Build a source-backed foundation proposal without AI

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Create a minimal deterministic foundation observation path for Phase 2 review.

Source: Phase 2 Durable bounded scraping (L1398–1400); Company Foundation (L110–121).

**Acceptance criteria / scope in**

- Emit validated effective website technical claim plus only explicitly observed foundation facts whose excerpts can be verified; default all other keys honestly.
- Assign trusted stable IDs and all field coverage; avoid inference of legal/founding/headquarters/employee exact facts and retain conflicts from differing explicit observations.
- Proposal conforms to shared provenance and can initialize the five singleton defaults transactionally without waiting for AI categories.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/foundation-observations.ts`, `tests/worker/foundation-observations.test.ts`.

Touches: `src/worker/extract/foundation-observations.ts`, `tests/worker/foundation-observations.test.ts`.

**Dependencies**

- Q062: Consumes sanitized visible text segments, metadata and structured link/CTA observations.
- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.
- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.

**Planned verification (not run)**

- Focused deterministic checks for: Emit validated effective website technical claim plus only explicitly observed foundation facts whose excerpts can be verified; default all other keys honestly.
- Focused deterministic checks for: Assign trusted stable IDs and all field coverage; avoid inference of legal/founding/headquarters/employee exact facts and retain conflicts from differing explicit observations.
- Focused deterministic checks for: Proposal conforms to shared provenance and can initialize the five singleton defaults transactionally without waiting for AI categories.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q066 — Coordinate one durable bounded crawl

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Wire fetch/robots/frontier/render/capture into resumable page tasks.

Source: End-to-end flow (L53–57); Crawl policy and real progress (L64–78).

**Acceptance criteria / scope in**

- Use gated HTTP-first capture plus qualified render fallback, one active company job and one claimed job/process; persist safe per-page outcomes, frontier/budgets and progress after tasks.
- Reuse finalized source rows on recovery, stop at cancellation/access loss/lease loss and avoid duplicate URLs/captures; no unawaited web-handler work.
- Finish with deterministic reviewable foundation proposals and honest succeeded/partial/failed coverage; every external URL execution requires accepted host gate.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/crawl/run-crawl.ts`, `tests/worker/run-crawl.test.ts`.

Touches: `src/worker/crawl/run-crawl.ts`, `tests/worker/run-crawl.test.ts`.

**Dependencies**

- Q064: Consumes restricted private SQL adapter with company/token on all calls.
- Q061: Consumes atomic document/depth/byte/time reservations and HTTP/render semaphores.
- Q063: Consumes rendered final text plus selector/style/resource/logo observations.
- Q065: Consumes deterministic evidence-backed website/foundation proposal with honest defaults.
- Q058: Consumes accepted real-topology non-Docker egress/sandbox qualification gate before arbitrary URLs.

**Planned verification (not run)**

- Focused deterministic checks for: Use gated HTTP-first capture plus qualified render fallback, one active company job and one claimed job/process; persist safe per-page outcomes, frontier/budgets and progress after tasks.
- Focused deterministic checks for: Reuse finalized source rows on recovery, stop at cancellation/access loss/lease loss and avoid duplicate URLs/captures; no unawaited web-handler work.
- Focused deterministic checks for: Finish with deterministic reviewable foundation proposals and honest succeeded/partial/failed coverage; every external URL execution requires accepted host gate.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q067 — Run the persistent worker lifecycle

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement a simple awaited claim/heartbeat/work loop with graceful shutdown.

Source: Components (L43–48); Crawl policy and real progress (L74–78); Phase 2 Durable bounded scraping (L1398–1400).

**Acceptance criteria / scope in**

- Persistent Node entry claims one job at a time, starts 15-second heartbeat and awaits crawl completion before next claim; no web-response continuation.
- Lease loss/access removal/cancel stops further tasks/finalization; exact-process shutdown checkpoints safely or leaves bounded lease recovery, never kills by name.
- Restart resumes persisted captures up to three attempts and reports safe worker health; secrets never enter renderer environment/logs.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/main.ts`, `src/worker/run-loop.ts`, `tests/worker/run-loop.test.ts`.

Touches: `src/worker/main.ts`, `src/worker/run-loop.ts`, `tests/worker/run-loop.test.ts`.

**Dependencies**

- Q066: Consumes resumable HTTP-first capture coordination and deterministic finish path.

**Planned verification (not run)**

- Focused deterministic checks for: Persistent Node entry claims one job at a time, starts 15-second heartbeat and awaits crawl completion before next claim; no web-response continuation.
- Focused deterministic checks for: Lease loss/access removal/cancel stops further tasks/finalization; exact-process shutdown checkpoints safely or leaves bounded lease recovery, never kills by name.
- Focused deterministic checks for: Restart resumes persisted captures up to three attempts and reports safe worker health; secrets never enter renderer environment/logs.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q068 — Expose enqueue, status and cancellation routes

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement company/job-scoped scrape HTTP operations.

Source: API and background-job contracts (L555–557); API and background-job contracts (L573–599).

**Acceptance criteria / scope in**

- Enqueue responds 202 with jobId/status using protected SQL after input/rate/scope validation; duplicate/active conflicts follow contract.
- Status returns only safe stage/counts/errors/proposal summary for company-qualified IDs; cancel requires owner/editor and calls cooperative cancellation.
- No provider secrets/prompts or invented percentage; member refresh can recover existing queued/active/terminal job.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/[companyId]/scrapes/route.ts`, `src/app/api/companies/[companyId]/scrapes/[jobId]/route.ts`, `src/app/api/companies/[companyId]/scrapes/[jobId]/cancel/route.ts`, `src/contracts/api-scrapes.ts`, `tests/api/scrapes.test.ts`.

Touches: `src/app/api/companies/[companyId]/scrapes/route.ts`, `src/app/api/companies/[companyId]/scrapes/[jobId]/route.ts`, `src/app/api/companies/[companyId]/scrapes/[jobId]/cancel/route.ts`, `src/contracts/api-scrapes.ts`, `tests/api/scrapes.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q047: Consumes protected enqueue/cancel and relational active-job/idempotency checks.
- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.

**Planned verification (not run)**

- Focused deterministic checks for: Enqueue responds 202 with jobId/status using protected SQL after input/rate/scope validation; duplicate/active conflicts follow contract.
- Focused deterministic checks for: Status returns only safe stage/counts/errors/proposal summary for company-qualified IDs; cancel requires owner/editor and calls cooperative cancellation.
- Focused deterministic checks for: No provider secrets/prompts or invented percentage; member refresh can recover existing queued/active/terminal job.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q069 — Show persisted progress and refresh recovery

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Add URL submission, active polling and partial outcome UI.

Source: Crawl policy and real progress (L76–76); Scrape and Build at `/knowledge?companyId=...` (L194–196).

**Acceptance criteria / scope in**

- URL/options validation and Start/Cancel use scoped APIs; URL retains companyId/jobId and refresh resumes persisted state.
- Poll active job every2 seconds, back off on errors and stop terminal; show actual stage/captured/failed/queued/limit and blocked/skipped/failure details.
- Partial results stay reviewable and fresh scrape possible; viewer mutations disabled; no-crawl/queued/validating/crawling/extracting/failed/cancelled/review states and saved drafts survive errors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/scrape/scrape-panel.tsx`, `src/components/scrape/use-job-polling.ts`, `tests/ui/scrape-progress.test.tsx`.

Touches: `src/components/scrape/scrape-panel.tsx`, `src/components/scrape/use-job-polling.ts`, `tests/ui/scrape-progress.test.tsx`, `src/components/knowledge/manual-editor.tsx`.

**Dependencies**

- Q068: Consumes enqueue/status/cancel HTTP endpoints and safe persisted job summaries.
- Q045: Consumes generation-aware preview/publish/download panel in the manual editor. Also consumes prior contents of src/components/knowledge/manual-editor.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: URL/options validation and Start/Cancel use scoped APIs; URL retains companyId/jobId and refresh resumes persisted state.
- Focused deterministic checks for: Poll active job every2 seconds, back off on errors and stop terminal; show actual stage/captured/failed/queued/limit and blocked/skipped/failure details.
- Focused deterministic checks for: Partial results stay reviewable and fresh scrape possible; viewer mutations disabled; no-crawl/queued/validating/crawling/extracting/failed/cancelled/review states and saved drafts survive errors.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q070 — Prove lease recovery, cancellation and access loss

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Add focused deterministic worker/database lifecycle integration checks.

Source: Focused test inventory (L1441–1441); Phase 2 Durable bounded scraping (L1400–1400).

**Acceptance criteria / scope in**

- Terminate only the exact test-started worker process after checkpoint; restart proves capture/import uniqueness, persisted progress and fenced stale finish/checkpoint/heartbeat.
- Concurrent processes claim different jobs; same-company active conflict holds; removed requester/archive prevents ingestion/finalization.
- Robots/429/timeouts and cancellation preserve completed sources, do not initialize unfinished proposals and retain honest partial/not_checked coverage.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/integration/worker-recovery.test.ts`, `tests/integration/worker-cancellation.test.ts`.

Touches: `tests/integration/worker-recovery.test.ts`, `tests/integration/worker-cancellation.test.ts`.

**Dependencies**

- Q067: Consumes persistent claim/heartbeat/work/shutdown lifecycle.
- Q068: Consumes enqueue/status/cancel HTTP endpoints and safe persisted job summaries.
- Q024: Consumes ordered baseline migration fixture and two-user test database setup.
- Q002: Consumes offline test configuration, disposable-database launcher and serialized browser runner.

**Planned verification (not run)**

- Focused deterministic checks for: Terminate only the exact test-started worker process after checkpoint; restart proves capture/import uniqueness, persisted progress and fenced stale finish/checkpoint/heartbeat.
- Focused deterministic checks for: Concurrent processes claim different jobs; same-company active conflict holds; removed requester/archive prevents ingestion/finalization.
- Focused deterministic checks for: Robots/429/timeouts and cancellation preserve completed sources, do not initialize unfinished proposals and retain honest partial/not_checked coverage.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q071 — Prove transport and browser escape denials

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Add representative network-boundary integration cases in the qualified host topology.

Source: Focused test inventory (L1442–1445); Network and rendering security (L94–98).

**Acceptance criteria / scope in**

- Private IPv4/IPv6/mapped/CGNAT/mixed answers, rebinding and every redirect are blocked before unsafe connection.
- CSS import, images/fonts, iframe/navigation/XHR/WebSocket and direct renderer DNS/socket/UDP escape probes cannot reach controlled private/metadata targets when application hooks are bypassed.
- Fixture-only allowlist is isolated from production; record exact host evidence and explicit NOT_PROVEN if topology unavailable, rather than counting mocks as confinement.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/security/renderer-egress.integration.test.ts`, `tests/security/network-matrix.ts`.

Touches: `tests/security/renderer-egress.integration.test.ts`, `tests/security/network-matrix.ts`.

**Dependencies**

- Q058: Consumes accepted real-topology non-Docker egress/sandbox qualification gate before arbitrary URLs.
- Q063: Consumes rendered final text plus selector/style/resource/logo observations.
- Q002: Consumes offline test configuration, disposable-database launcher and serialized browser runner.

**Planned verification (not run)**

- Focused deterministic checks for: Private IPv4/IPv6/mapped/CGNAT/mixed answers, rebinding and every redirect are blocked before unsafe connection.
- Focused deterministic checks for: CSS import, images/fonts, iframe/navigation/XHR/WebSocket and direct renderer DNS/socket/UDP escape probes cannot reach controlled private/metadata targets when application hooks are bypassed.
- Focused deterministic checks for: Fixture-only allowlist is isolated from production; record exact host evidence and explicit NOT_PROVEN if topology unavailable, rather than counting mocks as confinement.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

## Phase 3: Complete extraction and provenance

Acceptance gate (Q094): All seven categories and 41 fields attempted with complete assessments and no unexplained populated leaves.

Phase completion requires these outcome checks and relevant required deliverables; do not add blanket all-phase dependency edges. Local fixtures do not close live setup gates.

Phase-entry work with only earlier-phase inputs: Q072, Q087, Q088, Q089, Q090, Q091, Q092

### Q072 — Call strict Structured Outputs one page at a time

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement the worker-only OpenAI Responses adapter with configured model and bounded budget.

Source: Fixed decisions and verification gates (L26–26); Capture and extraction (L88–90); Material risks and controls (L1472–1472).

**Acceptance criteria / scope in**

- Use Zod-derived strict response schema and configured compatible model; input is bounded sanitized segments/observations inside explicit untrusted data, with no tools or credentials.
- One page-sized model task at a time, configured token/time ceiling and one transient retry within job budget; refusal/incomplete/invalid output become safe extraction failures.
- Record exact model/prompt/schema versions in envelopes and exclude prompts/provider credentials from errors/business values.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/model/responses.ts`, `src/worker/model/prompt.ts`, `tests/worker/model-adapter.test.ts`.

Touches: `src/worker/model/responses.ts`, `src/worker/model/prompt.ts`, `tests/worker/model-adapter.test.ts`.

**Dependencies**

- Q017: Consumes recorded valid/refused/incomplete/forged extraction responses.
- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.
- Q064: Consumes restricted private SQL adapter with company/token on all calls.

**Planned verification (not run)**

- Focused deterministic checks for: Use Zod-derived strict response schema and configured compatible model; input is bounded sanitized segments/observations inside explicit untrusted data, with no tools or credentials.
- Focused deterministic checks for: One page-sized model task at a time, configured token/time ceiling and one transient retry within job budget; refusal/incomplete/invalid output become safe extraction failures.
- Focused deterministic checks for: Record exact model/prompt/schema versions in envelopes and exclude prompts/provider credentials from errors/business values.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q073 — Validate candidate evidence before reduction

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Map segment references to immutable sources and reject unsupported model candidates.

Source: Capture and extraction (L88–90); Reusable validation contract (L770–774).

**Acceptance criteria / scope in**

- Local Zod and semantic checks validate URLs/scope, exact quote containment in recorded segments, technical selectors/values and allowed origins/types.
- Trusted worker assigns permanent IDs/evidence references after validation; model cannot invent source IDs/authors/review decisions.
- Reject fake citations, unsupported populated leaves, forbidden generation, inferred gender, illegal pricing forms and cycles; failed fields get partial/not_checked coverage.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/validate-candidates.ts`, `tests/worker/candidate-validation.test.ts`.

Touches: `src/worker/extract/validate-candidates.ts`, `tests/worker/candidate-validation.test.ts`.

**Dependencies**

- Q072: Consumes tool-free bounded strict-output Responses API adapter and versioned prompt.
- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.
- Q062: Consumes sanitized visible text segments, metadata and structured link/CTA observations.
- Q050: Consumes insert_source_capture with fenced immutable normalized-URL uniqueness.

**Planned verification (not run)**

- Focused deterministic checks for: Local Zod and semantic checks validate URLs/scope, exact quote containment in recorded segments, technical selectors/values and allowed origins/types.
- Focused deterministic checks for: Trusted worker assigns permanent IDs/evidence references after validation; model cannot invent source IDs/authors/review decisions.
- Focused deterministic checks for: Reject fake citations, unsupported populated leaves, forbidden generation, inferred gender, illegal pricing forms and cycles; failed fields get partial/not_checked coverage.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q074 — Attempt all Foundation and Positioning fields

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Add finite field rules for all foundation facts, pitch and founding story.

Source: Company Foundation (L106–121); Positioning (L123–128).

**Acceptance criteria / scope in**

- Attempt all twelve foundation fields and two positioning fields with exact excerpts, technical effective URL or permitted labeled interpretation/generation.
- Keep absent legal entity/founding year/story null; copyright is no founding evidence, first address is no headquarters, employee range/as-of/raw remains honest.
- Generated pitch cites accepted supporting fact claims and retains generated origin; founding story needs narrative, not year.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/foundation-positioning.ts`, `tests/worker/foundation-positioning.test.ts`.

Touches: `src/worker/extract/rules/foundation-positioning.ts`, `tests/worker/foundation-positioning.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.
- Q006: Consumes lossless employee-count and decimal-money pricing schemas.

**Planned verification (not run)**

- Focused deterministic checks for: Attempt all twelve foundation fields and two positioning fields with exact excerpts, technical effective URL or permitted labeled interpretation/generation.
- Focused deterministic checks for: Keep absent legal entity/founding year/story null; copyright is no founding evidence, first address is no headquarters, employee range/as-of/raw remains honest.
- Focused deterministic checks for: Generated pitch cites accepted supporting fact claims and retains generated origin; founding story needs narrative, not year.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q075 — Attempt audience, persona and outlook fields

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Implement the five narrative market-field extraction rules.

Source: Market and Customers (L134–138).

**Acceptance criteria / scope in**

- Attempt target_buyers/customer_needs/ideal_customer_personas/industry_groupings/industry_outlook with source/inferred/generated permissions per field.
- Generated personas cite supporting facts; commentary requires website publisher/date if stated and excerpt, with no independent research.
- Preserve stable IDs, honest [] and complete field assessments; no unobserved audience goals or unsupported outlook.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/market-narratives.ts`, `tests/worker/market-narratives.test.ts`.

Touches: `src/worker/extract/rules/market-narratives.ts`, `tests/worker/market-narratives.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: Attempt target_buyers/customer_needs/ideal_customer_personas/industry_groupings/industry_outlook with source/inferred/generated permissions per field.
- Focused deterministic checks for: Generated personas cite supporting facts; commentary requires website publisher/date if stated and excerpt, with no independent research.
- Focused deterministic checks for: Preserve stable IDs, honest [] and complete field assessments; no unobserved audience goals or unsupported outlook.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q076 — Extract visible channels, funnels, CTAs and partners

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Interpret only observed links and explicitly worded relationships.

Source: Market and Customers (L139–142); Crawl policy and real progress (L66–66).

**Acceptance criteria / scope in**

- Attempt channels/funnels/ctas/suppliers_and_partners with visible labels/destinations, stable step IDs and observed step ordering.
- Do not click/submit or invent internal funnel stages; apparent purpose is inferred separately from source label/URL.
- Partner requires explicit relationship wording; logo alone yields logo displayed with relationship_type null and no offsite crawl.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/journeys-partners.ts`, `tests/worker/journeys-partners.test.ts`.

Touches: `src/worker/extract/rules/journeys-partners.ts`, `tests/worker/journeys-partners.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: Attempt channels/funnels/ctas/suppliers_and_partners with visible labels/destinations, stable step IDs and observed step ordering.
- Focused deterministic checks for: Do not click/submit or invent internal funnel stages; apparent purpose is inferred separately from source label/URL.
- Focused deterministic checks for: Partner requires explicit relationship wording; logo alone yields logo displayed with relationship_type null and no offsite crawl.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q077 — Normalize font observations without inventing usage

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Map captured font evidence to business font entries.

Source: Capture and extraction (L84–84); Branding and Style (L150–150).

**Acceptance criteria / scope in**

- CSS declaration, loaded resource and computed-family observations remain independent with selectors/evidence; a fallback is never confirmed usage.
- Canonical methods/deduplication retain supporting evidence; apparent use is inferred when interpretive and brand_confirmed requires explicit guide evidence.
- Missing/inaccessible CSS yields partial/not_checked evidence rather than invented font records.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/style/fonts.ts`, `tests/worker/font-observations.test.ts`.

Touches: `src/worker/extract/style/fonts.ts`, `tests/worker/font-observations.test.ts`.

**Dependencies**

- Q063: Consumes rendered final text plus selector/style/resource/logo observations.
- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: CSS declaration, loaded resource and computed-family observations remain independent with selectors/evidence; a fallback is never confirmed usage.
- Focused deterministic checks for: Canonical methods/deduplication retain supporting evidence; apparent use is inferred when interpretive and brand_confirmed requires explicit guide evidence.
- Focused deterministic checks for: Missing/inaccessible CSS yields partial/not_checked evidence rather than invented font records.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q078 — Normalize observed colors and apparent roles

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Map captured CSS/computed colors into lossless color observations.

Source: Capture and extraction (L86–86); Branding and Style (L151–151).

**Acceptance criteria / scope in**

- Convert RGB/HSL opaque colors to #RRGGBB; retain alpha and composite-background evidence separately.
- Rank recurring interface colors with source selectors/values; apparent role is labeled interpretation and brand-guide-confirmed requires explicit evidence.
- Do not label every observed color as official brand color; IDs/evidence remain stable after deduplication.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/style/colors.ts`, `tests/worker/color-observations.test.ts`.

Touches: `src/worker/extract/style/colors.ts`, `tests/worker/color-observations.test.ts`.

**Dependencies**

- Q063: Consumes rendered final text plus selector/style/resource/logo observations.
- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: Convert RGB/HSL opaque colors to #RRGGBB; retain alpha and composite-background evidence separately.
- Focused deterministic checks for: Rank recurring interface colors with source selectors/values; apparent role is labeled interpretation and brand-guide-confirmed requires explicit evidence.
- Focused deterministic checks for: Do not label every observed color as official brand color; IDs/evidence remain stable after deduplication.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q079 — Identify company logos and official social profiles

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Filter observed assets/anchors without crawling third-party content.

Source: Capture and extraction (L86–86); Branding and Style (L152–152); Online Presence (L158–158).

**Acceptance criteria / scope in**

- Header/footer company context, alt/link text and absolute asset URL support company-logo identity; distinguish partner logos/favicon and inferred variants.
- Official social anchors preserve platform/profile URL and website evidence; exclude share/intent links and never crawl social/partner pages.
- Export URL/observation metadata only; no remote SVG injection, asset archive or arbitrary Next.js image optimization.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/logos-social.ts`, `tests/worker/logos-social.test.ts`.

Touches: `src/worker/extract/rules/logos-social.ts`, `tests/worker/logos-social.test.ts`.

**Dependencies**

- Q063: Consumes rendered final text plus selector/style/resource/logo observations.
- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: Header/footer company context, alt/link text and absolute asset URL support company-logo identity; distinguish partner logos/favicon and inferred variants.
- Focused deterministic checks for: Official social anchors preserve platform/profile URL and website evidence; exclude share/intent links and never crawl social/partner pages.
- Focused deterministic checks for: Export URL/observation metadata only; no remote SVG injection, asset archive or arbitrary Next.js image optimization.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q080 — Extract labeled writing and art interpretations

feature · Rank D · 20 min estimate · gpt-6.1-sol / medium effort

Ground style descriptions in representative text and rendered observations.

Source: Branding and Style (L148–149).

**Acceptance criteria / scope in**

- Writing style is inferred from representative original excerpts; art style uses rendered layout/imagery/graphic selectors/observations.
- No official brand-guide claim without evidence, and failed visual step keeps art_style_description null with honest assessment while technical fields can succeed.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/style-descriptions.ts`, `tests/worker/style-descriptions.test.ts`.

Touches: `src/worker/extract/rules/style-descriptions.ts`, `tests/worker/style-descriptions.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.
- Q063: Consumes rendered final text plus selector/style/resource/logo observations.

**Planned verification (not run)**

- Focused deterministic checks for: Writing style is inferred from representative original excerpts; art style uses rendered layout/imagery/graphic selectors/observations.
- Focused deterministic checks for: No official brand-guide claim without evidence, and failed visual step keeps art_style_description null with honest assessment while technical fields can succeed.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q081 — Extract relevant public people conservatively

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Attempt all five person fields and enforce explicit self-description restrictions.

Source: Key People (L160–170); Capture and extraction (L90–90); Material risks and controls (L1474–1474).

**Acceptance criteria / scope in**

- Name/title/role/background use public professional excerpts or permitted grounded summary; no wholly empty person is created.
- Gender stays null unless explicit public self-description with original wording; names/photos/pronouns/titles never infer gender and user values require same attestation.
- Same-name people remain separate possible duplicates unless stable matching URL or reviewer decision; assign permanent IDs.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/people.ts`, `tests/worker/people-extraction.test.ts`.

Touches: `src/worker/extract/rules/people.ts`, `tests/worker/people-extraction.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: Name/title/role/background use public professional excerpts or permitted grounded summary; no wholly empty person is created.
- Focused deterministic checks for: Gender stays null unless explicit public self-description with original wording; names/photos/pronouns/titles never infer gender and user values require same attestation.
- Focused deterministic checks for: Same-name people remain separate possible duplicates unless stable matching URL or reviewer decision; assign permanent IDs.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q082 — Extract offering-specific features and pricing

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Attempt all seven offering fields with lossless price semantics.

Source: Offerings (L172–184); Reusable validation contract (L685–695); Reusable validation contract (L770–770).

**Acceptance criteria / scope in**

- Separate nonempty offerings retain observed stable URLs and own features/pricing; do not assign a company-wide price to every product.
- Keep paid amount/range decimal strings/raw/currency/interval/model/qualifications/as-of, distinct free/contact/null pricing and no invented zero/currency/interval.
- Description/classification origins follow field rules and same-name products do not auto-merge without stable URL/reviewer decision.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/rules/offerings.ts`, `tests/worker/offering-extraction.test.ts`.

Touches: `src/worker/extract/rules/offerings.ts`, `tests/worker/offering-extraction.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.
- Q006: Consumes lossless employee-count and decimal-money pricing schemas.

**Planned verification (not run)**

- Focused deterministic checks for: Separate nonempty offerings retain observed stable URLs and own features/pricing; do not assign a company-wide price to every product.
- Focused deterministic checks for: Keep paid amount/range decimal strings/raw/currency/interval/model/qualifications/as-of, distinct free/contact/null pricing and no invented zero/currency/interval.
- Focused deterministic checks for: Description/classification origins follow field rules and same-name products do not auto-merge without stable URL/reviewer decision.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q083 — Compute all required field assessments honestly

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Build deterministic coverage over relevant processed material and failures.

Source: Extraction coverage matrix (L102–104); Stable paths and content provenance (L629–629); Reusable validation contract (L772–772).

**Acceptance criteria / scope in**

- Each of 41 field definitions resolves exactly once per required singleton/existing person/offering item, including empty/null values and fields with user values.
- found means usable evidence, not_found bounded relevant success, not_checked no relevant processing, partial failed/skipped/truncated relevant work and conflict retained candidates.
- Persist last job/reasons, propagate page/category refusal/timeout/render/budget limitations without inventing universal negatives or review status.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/coverage.ts`, `tests/worker/coverage.test.ts`.

Touches: `src/worker/extract/coverage.ts`, `tests/worker/coverage.test.ts`.

**Dependencies**

- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.
- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.

**Planned verification (not run)**

- Focused deterministic checks for: Each of 41 field definitions resolves exactly once per required singleton/existing person/offering item, including empty/null values and fields with user values.
- Focused deterministic checks for: found means usable evidence, not_found bounded relevant success, not_checked no relevant processing, partial failed/skipped/truncated relevant work and conflict retained candidates.
- Focused deterministic checks for: Persist last job/reasons, propagate page/category refusal/timeout/render/budget limitations without inventing universal negatives or review status.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q084 — Reduce candidates without silent selection

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Combine identical facts/evidence and retain material conflicts deterministically.

Source: Capture and extraction (L90–90); Stable paths and content provenance (L631–631).

**Acceptance criteria / scope in**

- Normalize equal candidates and deduplicate supporting evidence; different candidates remain one field conflict with all original evidence.
- Never prefer recency/homepage/model confidence; same-name entities require stable URL/reviewer match and no unintended merge.
- Selected business values remain unresolved until human review; keep model/prompt/schema versions outside content and preserve sensitive unselected candidates internally.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/reduce.ts`, `tests/worker/candidate-reducer.test.ts`.

Touches: `src/worker/extract/reduce.ts`, `tests/worker/candidate-reducer.test.ts`.

**Dependencies**

- Q073: Consumes local evidence-to-source mapping and semantic candidate rejection.
- Q083: Consumes exactly-once per-field found/missing/unchecked/partial/conflict computation.

**Planned verification (not run)**

- Focused deterministic checks for: Normalize equal candidates and deduplicate supporting evidence; different candidates remain one field conflict with all original evidence.
- Focused deterministic checks for: Never prefer recency/homepage/model confidence; same-name entities require stable URL/reviewer match and no unintended merge.
- Focused deterministic checks for: Selected business values remain unresolved until human review; keep model/prompt/schema versions outside content and preserve sensitive unselected candidates internally.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q085 — Enforce strict proposal ingestion and frozen candidates

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Extend protected proposal validation without changing the table design.

Source: Proposed table definitions (L398–398); Relationships and historical integrity (L411–413); Phase 3 Complete extraction and provenance (L1404–1408); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Validate all 41 fields/nested structures, candidate origins, source evidence, coverage/conflict IDs and stable paths before finish_job persists proposals/imports.
- Once extraction content is finalized, later review writes may only append bounded decisions; candidate payload/source rows stay unchanged.
- Fake quotes, unknown source IDs, inferred gender and unsupported generated fields fail under direct restricted-worker calls as well as application validation.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0018_validate_proposals.sql`, `tests/db/proposal-validation.test.ts`.

Touches: `supabase/migrations/0018_validate_proposals.sql`, `tests/db/proposal-validation.test.ts`.

**Dependencies**

- Q051: Consumes finish_job and atomic all-or-nothing empty-company initial import.
- Q030: Consumes same-company source/quote/technical evidence and historical-reference validators.
- Q084: Consumes deterministic candidate/evidence deduplication without silent conflict choice.

**Planned verification (not run)**

- Focused deterministic checks for: Validate all 41 fields/nested structures, candidate origins, source evidence, coverage/conflict IDs and stable paths before finish_job persists proposals/imports.
- Focused deterministic checks for: Once extraction content is finalized, later review writes may only append bounded decisions; candidate payload/source rows stay unchanged.
- Focused deterministic checks for: Fake quotes, unknown source IDs, inferred gender and unsupported generated fields fail under direct restricted-worker calls as well as application validation.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q086 — Wire complete extraction into durable jobs

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Process captured pages through deterministic rules, model candidates, reduction and finalization.

Source: Capture and extraction (L82–90); Phase 3 Complete extraction and provenance (L1404–1408).

**Acceptance criteria / scope in**

- Use finalized captures and bounded page-by-page adapter/rules for all categories, checkpoint extraction completion IDs and resume without repeating successful pages.
- Build full validated proposals/coverage, preserve per-page/category failures and feed atomic first-import/proposal-only finish; no overwrite of existing drafts.
- Do not run model calls inside database transactions; deterministic foundation-only fixture path remains available for Phase 2 tests.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/worker/extract/pipeline.ts`, `tests/worker/extraction-pipeline.test.ts`.

Touches: `src/worker/extract/pipeline.ts`, `tests/worker/extraction-pipeline.test.ts`, `src/worker/crawl/run-crawl.ts`.

**Dependencies**

- Q074: Consumes all foundation/positioning candidate rules and restricted fact handling.
- Q075: Consumes audience/persona/outlook extraction with field-specific origins.
- Q076: Consumes observed journeys/CTA/partner relationship extraction rules.
- Q077: Consumes separate declared/loaded/computed font normalization.
- Q078: Consumes RGB/HSL/alpha normalization and observed-versus-confirmed color rules.
- Q079: Consumes company-logo and official-profile identification with offsite crawl exclusion.
- Q080: Consumes text/render-grounded inferred style descriptions.
- Q081: Consumes public professional person extraction and explicit-gender restriction.
- Q082: Consumes offering-specific feature and lossless pricing extraction.
- Q085: Consumes protected proposal ingestion validation and frozen extracted candidate content.
- Q066: Consumes resumable HTTP-first capture coordination and deterministic finish path. Also consumes prior contents of src/worker/crawl/run-crawl.ts; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: Use finalized captures and bounded page-by-page adapter/rules for all categories, checkpoint extraction completion IDs and resume without repeating successful pages.
- Focused deterministic checks for: Build full validated proposals/coverage, preserve per-page/category failures and feed atomic first-import/proposal-only finish; no overwrite of existing drafts.
- Focused deterministic checks for: Do not run model calls inside database transactions; deterministic foundation-only fixture path remains available for Phase 2 tests.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q087 — Add native positioning controls

feature · Rank E · 20 min estimate · gpt-6-luna / medium effort

Provide a small pitch/story form with nullable values and honest origins.

Source: Positioning (L123–128); Scrape and Build at `/knowledge?companyId=...` (L194–198).

**Acceptance criteria / scope in**

- Render company_pitch and founding_story using strict nullable contracts, escaped text and origin/coverage labels.
- Edits stay in company-scoped draft state and preserve generated-pitch versus source-story distinctions; explicit review/save remains the entry boundary.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/positioning-form.tsx`, `tests/ui/positioning-form.test.tsx`.

Touches: `src/components/knowledge/positioning-form.tsx`, `tests/ui/positioning-form.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q008: Consumes Positioning schema and pitch/story origin permissions.

**Planned verification (not run)**

- Focused deterministic checks for: Render company_pitch and founding_story using strict nullable contracts, escaped text and origin/coverage labels.
- Focused deterministic checks for: Edits stay in company-scoped draft state and preserve generated-pitch versus source-story distinctions; explicit review/save remains the entry boundary.

Sizing: Small mechanical configuration or bounded data definition. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Mechanical bounded work.

### Q088 — Add native market collection controls

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Provide explicit controls for the nine market structures.

Source: Market and Customers (L130–142); Scrape and Build at `/knowledge?companyId=...` (L194–198).

**Acceptance criteria / scope in**

- Render all nine market collections including nested persona goals/pains, funnel steps and partner relationship text with empty/nullable defaults.
- Edits retain item IDs, new items receive UUIDs and deleted items leave historical provenance only; validation errors are actionable and values are escaped.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/market-form.tsx`, `tests/ui/market-form.test.tsx`.

Touches: `src/components/knowledge/market-form.tsx`, `tests/ui/market-form.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q009: Consumes nine market collection schemas and their origin restrictions.

**Planned verification (not run)**

- Focused deterministic checks for: Render all nine market collections including nested persona goals/pains, funnel steps and partner relationship text with empty/nullable defaults.
- Focused deterministic checks for: Edits retain item IDs, new items receive UUIDs and deleted items leave historical provenance only; validation errors are actionable and values are escaped.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q089 — Add native branding controls

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Provide explicit forms for the five style and visual-observation fields.

Source: Branding and Style (L144–152); Scrape and Build at `/knowledge?companyId=...` (L194–198).

**Acceptance criteria / scope in**

- Render style descriptions, fonts, colors and logos with nullable defaults, stable item IDs and origin/coverage labels.
- Font methods/confirmation and color alpha/classification stay technical metadata; apparent usage/roles remain honest interpretation.
- Logo is a validated HTTP(S) link; no executable SVG/remote page embedding or arbitrary image optimization.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/branding-form.tsx`, `tests/ui/branding-form.test.tsx`.

Touches: `src/components/knowledge/branding-form.tsx`, `tests/ui/branding-form.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q010: Consumes BrandingAndStyle/OnlinePresence schemas and observation metadata.

**Planned verification (not run)**

- Focused deterministic checks for: Render style descriptions, fonts, colors and logos with nullable defaults, stable item IDs and origin/coverage labels.
- Focused deterministic checks for: Font methods/confirmation and color alpha/classification stay technical metadata; apparent usage/roles remain honest interpretation.
- Focused deterministic checks for: Logo is a validated HTTP(S) link; no executable SVG/remote page embedding or arbitrary image optimization.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q090 — Add official social profile controls

feature · Rank E · 20 min estimate · gpt-6-luna / medium effort

Provide a simple stable-ID list form for online presence.

Source: Online Presence (L154–158); Scrape and Build at `/knowledge?companyId=...` (L194–198).

**Acceptance criteria / scope in**

- Render editable platform/profile URL rows with [] default, stable retained IDs, new UUIDs and actionable URL errors.
- Show source/user origin and coverage honestly, escape labels and open only validated HTTP(S) links safely; this form never crawls social sites.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/online-form.tsx`, `tests/ui/online-form.test.tsx`.

Touches: `src/components/knowledge/online-form.tsx`, `tests/ui/online-form.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q010: Consumes BrandingAndStyle/OnlinePresence schemas and observation metadata.

**Planned verification (not run)**

- Focused deterministic checks for: Render editable platform/profile URL rows with [] default, stable retained IDs, new UUIDs and actionable URL errors.
- Focused deterministic checks for: Show source/user origin and coverage honestly, escape labels and open only validated HTTP(S) links safely; this form never crawls social sites.

Sizing: Small mechanical configuration or bounded data definition. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Mechanical bounded work.

### Q091 — Add separately reviewable person controls

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Provide explicit controls for each permanent-UUID person entry.

Source: Key People (L160–170); Scrape and Build at `/knowledge?companyId=...` (L194–198).

**Acceptance criteria / scope in**

- Render all five person fields with nullable defaults, honest origin/coverage and stable entry identity; each person is a separate review unit.
- Gender entry requires explicit self-description attestation and never guesses; wholly empty people fail validation while unknown gender permits approval.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/person-form.tsx`, `tests/ui/person-form.test.tsx`.

Touches: `src/components/knowledge/person-form.tsx`, `tests/ui/person-form.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q011: Consumes strict repeatable Person/Offering schemas with permanent item IDs.

**Planned verification (not run)**

- Focused deterministic checks for: Render all five person fields with nullable defaults, honest origin/coverage and stable entry identity; each person is a separate review unit.
- Focused deterministic checks for: Gender entry requires explicit self-description attestation and never guesses; wholly empty people fail validation while unknown gender permits approval.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q092 — Add complete offering controls

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Provide simple per-offering fields, stable feature items and price forms.

Source: Offerings (L172–184); Reusable validation contract (L685–695).

**Acceptance criteria / scope in**

- Render all seven fields, numeric/raw/null free/contact/paid pricing and nullable currency/interval/qualifications/as-of without losing precision.
- Each offering is separately editable/reviewable and feature IDs persist; reject wholly empty entries and contradictory pricing with useful messages.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/offering-form.tsx`, `tests/ui/offering-form.test.tsx`.

Touches: `src/components/knowledge/offering-form.tsx`, `tests/ui/offering-form.test.tsx`.

**Dependencies**

- Q043: Consumes company-scoped reducer/context with explicit saves and stale-edit preservation.
- Q013: Consumes complete seven-category field registry, 41 coverage definitions and null/[] defaults.

**Planned verification (not run)**

- Focused deterministic checks for: Render all seven fields, numeric/raw/null free/contact/paid pricing and nullable currency/interval/qualifications/as-of without losing precision.
- Focused deterministic checks for: Each offering is separately editable/reviewable and feature IDs persist; reject wholly empty entries and contradictory pricing with useful messages.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q093 — Connect all seven category forms to draft state

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Replace static category placeholders with complete source-aware editing.

Source: Scrape and Build at `/knowledge?companyId=...` (L194–198); Phase 3 Complete extraction and provenance (L1408–1408).

**Acceptance criteria / scope in**

- Seven tabs show per-category coverage/review counts and render typed singleton/person/offering forms under company generation.
- Every required field displays value/origin and honest found/not-found/could-not-check/partial/conflict explanation; unknowns remain reviewable.
- Existing explicit save/publication/progress path stays wired and viewers retain evidence/history access without mutation controls.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/category-editor.tsx`, `tests/ui/category-editor.test.tsx`.

Touches: `src/components/knowledge/category-editor.tsx`, `tests/ui/category-editor.test.tsx`, `src/components/knowledge/manual-editor.tsx`.

**Dependencies**

- Q087: Consumes native typed pitch/story form component.
- Q088: Consumes native typed market collection form component.
- Q089: Consumes native typed five-field style form component.
- Q090: Consumes native typed official social-profile list form.
- Q091: Consumes native typed separately reviewable person form component.
- Q092: Consumes native offering/feature/pricing form component.
- Q069: Consumes refresh-safe company/job polling and progress panel wired into the editor. Also consumes prior contents of src/components/knowledge/manual-editor.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: Seven tabs show per-category coverage/review counts and render typed singleton/person/offering forms under company generation.
- Focused deterministic checks for: Every required field displays value/origin and honest found/not-found/could-not-check/partial/conflict explanation; unknowns remain reviewable.
- Focused deterministic checks for: Existing explicit save/publication/progress path stays wired and viewers retain evidence/history access without mutation controls.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q094 — Prove complete fixture extraction and provenance

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Add one golden fixture validation across all categories and adverse recorded model variants.

Source: Phase 3 Complete extraction and provenance (L1406–1408); Focused test inventory (L1434–1437).

**Acceptance criteria / scope in**

- Golden fixture validates 41 required field assessments and every populated leaf citation, text/style/social/person/offering values, null legal/gender/story/outlook and preserved address conflict.
- Range/contact/free/unknown pricing and font declared/loaded/computed distinctions remain distinct; refused/incomplete/fake-citation output cannot initialize entries.
- Validate stable IDs/pointers, origin support and full default contract, with no live model calls and no full source bodies/secrets in export.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/integration/extraction-golden.test.ts`.

Touches: `tests/integration/extraction-golden.test.ts`.

**Dependencies**

- Q086: Consumes durable all-category page extraction, checkpoint/reduce/finalize pipeline.
- Q017: Consumes recorded valid/refused/incomplete/forged extraction responses.
- Q093: Consumes complete seven-tab editor and honest field assessment rendering.

**Planned verification (not run)**

- Focused deterministic checks for: Golden fixture validates 41 required field assessments and every populated leaf citation, text/style/social/person/offering values, null legal/gender/story/outlook and preserved address conflict.
- Focused deterministic checks for: Range/contact/free/unknown pricing and font declared/loaded/computed distinctions remain distinct; refused/incomplete/fake-citation output cannot initialize entries.
- Focused deterministic checks for: Validate stable IDs/pointers, origin support and full default contract, with no live model calls and no full source bodies/secrets in export.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

## Phase 4: Review, corrections and re-scraping

Acceptance gate (Q108): Review corrections/conflicts/generated origin, history/revert, re-scrape proposals and accessible APA evidence work without silent overwrite.

Phase completion requires these outcome checks and relevant required deliverables; do not add blanket all-phase dependency edges. Local fixtures do not close live setup gates.

Phase-entry work with only earlier-phase inputs: Q095, Q098, Q102, Q105

### Q095 — Recompute provenance only for changed leaves

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement shared revision transformation for edits, clears and approval-only saves.

Source: Revisions and publication transactions (L605–607); Stable paths and content provenance (L625–631).

**Acceptance criteria / scope in**

- Unchanged source/inferred/generated leaves retain claims; changed/cleared leaves receive user actor/time/note and historical supersedes links without mutating original quote.
- Approval-only change preserves origin, content and evidence in a new revision; edit of approved entry becomes unreviewed.
- Stable-ID reorder preserves claims, explicit nested order changes are parent revisions and deleted IDs cannot remain active provenance targets.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/knowledge/revise-provenance.ts`, `tests/knowledge/revise-provenance.test.ts`.

Touches: `src/knowledge/revise-provenance.ts`, `tests/knowledge/revise-provenance.test.ts`.

**Dependencies**

- Q015: Consumes per-leaf compatible claim, origin, coverage and support-graph validation.
- Q033: Consumes company-locked save_entry_revision, generation checks and request replay.

**Planned verification (not run)**

- Focused deterministic checks for: Unchanged source/inferred/generated leaves retain claims; changed/cleared leaves receive user actor/time/note and historical supersedes links without mutating original quote.
- Focused deterministic checks for: Approval-only change preserves origin, content and evidence in a new revision; edit of approved entry becomes unreviewed.
- Focused deterministic checks for: Stable-ID reorder preserves claims, explicit nested order changes are parent revisions and deleted IDs cannot remain active provenance targets.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q096 — Record bounded human conflict resolutions

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement candidate choice or field-clear decision controls and validation.

Source: Capture and extraction (L90–90); Scrape and Build at `/knowledge?companyId=...` (L198–200); Stable paths and content provenance (L631–631).

**Acceptance criteria / scope in**

- Show differing candidates with their evidence and allow choosing one, correction or clear; record bounded decision with stable target/candidate IDs.
- Material conflict blocks approval until resolved/cleared; original candidate/evidence history remains immutable and only selected approved values export.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/conflict-chooser.tsx`, `src/knowledge/conflict-decisions.ts`, `tests/knowledge/conflict-decisions.test.ts`.

Touches: `src/components/knowledge/conflict-chooser.tsx`, `src/knowledge/conflict-decisions.ts`, `tests/knowledge/conflict-decisions.test.ts`.

**Dependencies**

- Q095: Consumes changed-leaf user/supersedes transformation with stable-ID retention.
- Q084: Consumes deterministic candidate/evidence deduplication without silent conflict choice.
- Q093: Consumes complete seven-tab editor and honest field assessment rendering.

**Planned verification (not run)**

- Focused deterministic checks for: Show differing candidates with their evidence and allow choosing one, correction or clear; record bounded decision with stable target/candidate IDs.
- Focused deterministic checks for: Material conflict blocks approval until resolved/cleared; original candidate/evidence history remains immutable and only selected approved values export.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q097 — Complete explicit save, approve and reject workflow

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Wire complete category forms to protected revision semantics.

Source: Scrape and Build at `/knowledge?companyId=...` (L196–198); Phase 4 Review, corrections and re-scraping (L1414–1416).

**Acceptance criteria / scope in**

- Save draft/Save and approve/Approve unchanged/Reject create explicit revisions and preserve unknown values; five singletons and individual people/offerings are review units.
- Rejection/Remove excludes future snapshot values but retains history/coverage; editing approved content resets approval and stale409 preserves unsaved edits for manual comparison.
- Company-scoped UI displays saving/unsaved/stale/conflict/approved/rejected states; generated suggestions stay generated when approved and no keystroke autosave.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/review-actions.tsx`, `tests/ui/review-actions.test.tsx`.

Touches: `src/components/knowledge/review-actions.tsx`, `tests/ui/review-actions.test.tsx`, `src/components/knowledge/category-editor.tsx`.

**Dependencies**

- Q096: Consumes recorded choose/correct/clear conflict decisions and approval eligibility.
- Q040: Consumes company-qualified current drafts, initial entries and revision HTTP operations.

**Planned verification (not run)**

- Focused deterministic checks for: Save draft/Save and approve/Approve unchanged/Reject create explicit revisions and preserve unknown values; five singletons and individual people/offerings are review units.
- Focused deterministic checks for: Rejection/Remove excludes future snapshot values but retains history/coverage; editing approved content resets approval and stale409 preserves unsaved edits for manual comparison.
- Focused deterministic checks for: Company-scoped UI displays saving/unsaved/stale/conflict/approved/rejected states; generated suggestions stay generated when approved and no keystroke autosave.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q098 — Restore history into a new revision

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement company-qualified revert_entry without mutating old content.

Source: API and background-job contracts (L561–571); Revisions and publication transactions (L605–607); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Under company lock require role/archive and expected current revision; copy requested same-company prior content/provenance to new unreviewed revision with reason/reverted_from_revision.
- Operation UUID replay returns same revision for matching body and conflicts otherwise; no old revision/source update or silent stale retry.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0019_revert_entry.sql`, `tests/db/revert.test.ts`.

Touches: `supabase/migrations/0019_revert_entry.sql`, `tests/db/revert.test.ts`.

**Dependencies**

- Q033: Consumes company-locked save_entry_revision, generation checks and request replay.

**Planned verification (not run)**

- Focused deterministic checks for: Under company lock require role/archive and expected current revision; copy requested same-company prior content/provenance to new unreviewed revision with reason/reverted_from_revision.
- Focused deterministic checks for: Operation UUID replay returns same revision for matching body and conflicts otherwise; no old revision/source update or silent stale retry.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q099 — Expose immutable history and protected revert routes

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Add company-qualified entry history and revert HTTP operations.

Source: API and background-job contracts (L561–564).

**Acceptance criteria / scope in**

- GET history returns only same-company immutable revisions with author/time/reason/review/provenance; members/viewers may read.
- POST revert validates fromRevision/expectedRevision/requestId and calls revert_entry as caller; owner/editor only, stale409/current revision and idempotent replay follow shared contracts.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/[companyId]/entries/[entryId]/history/route.ts`, `src/app/api/companies/[companyId]/entries/[entryId]/revert/route.ts`, `tests/api/history.test.ts`.

Touches: `src/app/api/companies/[companyId]/entries/[entryId]/history/route.ts`, `src/app/api/companies/[companyId]/entries/[entryId]/revert/route.ts`, `tests/api/history.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q098: Consumes protected idempotent revert_entry copying history into a new unreviewed revision.

**Planned verification (not run)**

- Focused deterministic checks for: GET history returns only same-company immutable revisions with author/time/reason/review/provenance; members/viewers may read.
- Focused deterministic checks for: POST revert validates fromRevision/expectedRevision/requestId and calls revert_entry as caller; owner/editor only, stale409/current revision and idempotent replay follow shared contracts.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q100 — Browse entry history and restore prior content

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Build the history dialog and wire current-entry History actions.

Source: Scrape and Build at `/knowledge?companyId=...` (L198–198); View and Manage at `/knowledge/view?companyId=...` (L206–206).

**Acceptance criteria / scope in**

- History dialog displays immutable revisions with author/time/reason/review/origin and original evidence; viewers inspect without revert controls.
- Restore posts the selected prior revision against current expected revision and creates a new unreviewed revision; stale409 retains unsaved edits and requires comparison.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/entry-history.tsx`, `tests/ui/history.test.tsx`.

Touches: `src/components/knowledge/entry-history.tsx`, `tests/ui/history.test.tsx`, `src/components/knowledge/review-actions.tsx`.

**Dependencies**

- Q099: Consumes company-qualified immutable history/revert HTTP contract.
- Q097: Consumes explicit save/approve/reject controls across all entry kinds. Also consumes prior contents of src/components/knowledge/review-actions.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: History dialog displays immutable revisions with author/time/reason/review/origin and original evidence; viewers inspect without revert controls.
- Focused deterministic checks for: Restore posts the selected prior revision against current expected revision and creates a new unreviewed revision; stale409 retains unsaved edits and requires comparison.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q101 — Apply selected proposals with current revision checks

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Implement protected apply_proposal against the current draft.

Source: Scrape and Build at `/knowledge?companyId=...` (L200–200); API and background-job contracts (L562–571); Protected functions and trust boundaries (L540–540); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Under company lock validate caller/archive/company/job/source/candidate IDs and expected latest revision; re-evaluate old proposal conflicts against current revision.
- Apply only selected candidates, preserving unselected current/user data, and insert a new unreviewed revision or validated new entry; no automatic merge/overwrite.
- Request replay is idempotent with body conflict rejection; append decision metadata while retaining extracted candidates/sources.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0020_apply_proposal.sql`, `tests/db/apply-proposal.test.ts`.

Touches: `supabase/migrations/0020_apply_proposal.sql`, `tests/db/apply-proposal.test.ts`.

**Dependencies**

- Q085: Consumes protected proposal ingestion validation and frozen extracted candidate content.
- Q033: Consumes company-locked save_entry_revision, generation checks and request replay.
- Q095: Consumes changed-leaf user/supersedes transformation with stable-ID retention.

**Planned verification (not run)**

- Focused deterministic checks for: Under company lock validate caller/archive/company/job/source/candidate IDs and expected latest revision; re-evaluate old proposal conflicts against current revision.
- Focused deterministic checks for: Apply only selected candidates, preserving unselected current/user data, and insert a new unreviewed revision or validated new entry; no automatic merge/overwrite.
- Focused deterministic checks for: Request replay is idempotent with body conflict rejection; append decision metadata while retaining extracted candidates/sources.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q102 — Dismiss proposals without deleting evidence

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Implement protected append-only proposal dismissal decisions.

Source: Scrape and Build at `/knowledge?companyId=...` (L200–200); API and background-job contracts (L563–563); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Require owner/editor/unarchived/company-qualified job+proposal and append bounded actor/time/reason decision only.
- Candidate content, sources, existing revisions and other job decisions remain unchanged; cross-company/invalid IDs return unavailable.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0021_dismiss_proposal.sql`, `tests/db/dismiss-proposal.test.ts`.

Touches: `supabase/migrations/0021_dismiss_proposal.sql`, `tests/db/dismiss-proposal.test.ts`.

**Dependencies**

- Q085: Consumes protected proposal ingestion validation and frozen extracted candidate content.
- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.

**Planned verification (not run)**

- Focused deterministic checks for: Require owner/editor/unarchived/company-qualified job+proposal and append bounded actor/time/reason decision only.
- Focused deterministic checks for: Candidate content, sources, existing revisions and other job decisions remain unchanged; cross-company/invalid IDs return unavailable.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q103 — Expose protected proposal apply and dismiss routes

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Add validated company/job/proposal-scoped HTTP operations.

Source: API and background-job contracts (L562–563).

**Acceptance criteria / scope in**

- Apply validates job/entry/expectedRevision/selectedCandidateIds/requestId and delegates to protected apply_proposal; stale409 and request replay remain safe.
- Dismiss validates job/reason and delegates to append-only dismiss_proposal; owner/editor only and other-company IDs return generic unavailable without candidate/evidence mutation.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/[companyId]/proposals/[proposalId]/apply/route.ts`, `src/app/api/companies/[companyId]/proposals/[proposalId]/dismiss/route.ts`, `tests/api/proposals.test.ts`.

Touches: `src/app/api/companies/[companyId]/proposals/[proposalId]/apply/route.ts`, `src/app/api/companies/[companyId]/proposals/[proposalId]/dismiss/route.ts`, `tests/api/proposals.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q101: Consumes protected selected-candidate apply with expected-revision/current-conflict checks.
- Q102: Consumes protected append-only job proposal dismissal decisions.

**Planned verification (not run)**

- Focused deterministic checks for: Apply validates job/entry/expectedRevision/selectedCandidateIds/requestId and delegates to protected apply_proposal; stale409 and request replay remain safe.
- Focused deterministic checks for: Dismiss validates job/reason and delegates to append-only dismiss_proposal; owner/editor only and other-company IDs return generic unavailable without candidate/evidence mutation.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q104 — Compare and review re-scrape proposals

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Build the current-versus-proposed review panel and editor wiring.

Source: Scrape and Build at `/knowledge?companyId=...` (L200–200).

**Acceptance criteria / scope in**

- Panel shows current/proposed values with both evidence sets and selected-candidate checkboxes; apply creates unreviewed revision and dismiss retains extracted evidence.
- Submit company/job/proposal/current revision/request IDs, surface stale409 and preserve selection/unsaved edits.
- Re-scrape itself never overwrites approved/user draft values; viewers inspect but cannot apply/dismiss.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/knowledge/proposals-panel.tsx`, `tests/ui/proposals.test.tsx`.

Touches: `src/components/knowledge/proposals-panel.tsx`, `tests/ui/proposals.test.tsx`, `src/components/knowledge/category-editor.tsx`.

**Dependencies**

- Q103: Consumes validated apply/dismiss HTTP contract over protected functions.
- Q097: Consumes explicit save/approve/reject controls across all entry kinds. Also consumes prior contents of src/components/knowledge/category-editor.tsx; this shared writer is serialized.
- Q069: Consumes refresh-safe company/job polling and progress panel wired into the editor.

**Planned verification (not run)**

- Focused deterministic checks for: Panel shows current/proposed values with both evidence sets and selected-candidate checkboxes; apply creates unreviewed revision and dismiss retains extracted evidence.
- Focused deterministic checks for: Submit company/job/proposal/current revision/request IDs, surface stale409 and preserve selection/unsaved edits.
- Focused deterministic checks for: Re-scrape itself never overwrites approved/user draft values; viewers inspect but cannot apply/dismiss.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q105 — Format honest deterministic APA references

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Implement pure author-date citation and full-reference formatting.

Source: APA evidence interaction (L208–214).

**Acceptance criteria / scope in**

- Use observed author/publication date only, title fallback for missing author, n.d. for missing date and site name if distinct; crawl time never becomes publication time.
- Same-author/year suffixes follow deterministic source order; retrieval timestamp is provenance and retrieval-date phrase appears for changeable pages.
- Generated/inferred/user/unknown labels distinguish nonquote wording, supporting fact citations, correction actor/time and superseded claims; unknowns have no spurious citation.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/knowledge/apa.ts`, `tests/knowledge/apa.test.ts`.

Touches: `src/knowledge/apa.ts`, `tests/knowledge/apa.test.ts`.

**Dependencies**

- Q012: Consumes typed source/evidence/claim, proposal, job status/checkpoint and progress envelopes.

**Planned verification (not run)**

- Focused deterministic checks for: Use observed author/publication date only, title fallback for missing author, n.d. for missing date and site name if distinct; crawl time never becomes publication time.
- Focused deterministic checks for: Same-author/year suffixes follow deterministic source order; retrieval timestamp is provenance and retrieval-date phrase appears for changeable pages.
- Focused deterministic checks for: Generated/inferred/user/unknown labels distinguish nonquote wording, supporting fact citations, correction actor/time and superseded claims; unknowns have no spurious citation.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q106 — Build an accessible interactive evidence popover

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement hover/focus/tap citation interaction with escaped evidence.

Source: APA evidence interaction (L210–214); Network and rendering security (L98–98).

**Acceptance criteria / scope in**

- Popover contains exact original excerpt or labeled technical evidence/full APA/source URL, stays open within trigger/popover and closes after leaving both, Escape or outside click.
- Support tap/keyboard focus/accessible relationships and small-screen evidence drawer; generated/user/superseded states show honest attribution.
- React escapes all values/excerpts; validated HTTP(S) links use noopener noreferrer and no raw HTML/remote SVG/page embedding.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/evidence/citation-popover.tsx`, `src/components/evidence/evidence-drawer.tsx`, `tests/ui/citation-popover.test.tsx`.

Touches: `src/components/evidence/citation-popover.tsx`, `src/components/evidence/evidence-drawer.tsx`, `tests/ui/citation-popover.test.tsx`.

**Dependencies**

- Q105: Consumes deterministic observed-metadata APA formatter and honest non-source attribution.
- Q002: Consumes offline test configuration, disposable-database launcher and serialized browser runner.

**Planned verification (not run)**

- Focused deterministic checks for: Popover contains exact original excerpt or labeled technical evidence/full APA/source URL, stays open within trigger/popover and closes after leaving both, Escape or outside click.
- Focused deterministic checks for: Support tap/keyboard focus/accessible relationships and small-screen evidence drawer; generated/user/superseded states show honest attribution.
- Focused deterministic checks for: React escapes all values/excerpts; validated HTTP(S) links use noopener noreferrer and no raw HTML/remote SVG/page embedding.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q107 — Expose citations for every factual leaf

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Connect claim-resolved citation controls across category forms and summaries.

Source: APA evidence interaction (L212–214); Reusable validation contract (L772–772).

**Acceptance criteria / scope in**

- Every displayed populated business leaf can open its compatible claim evidence; nested summary expansion exposes each nested leaf citation and item IDs need no citation.
- Origin badges, unknown coverage explanations and user superseded evidence remain accurate after edits/reorder/revert; factual support never derives from approval alone.
- Wire evidence UI into complete editor without duplicating/rewriting source quotes or unsafe previewing logos.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/evidence/cited-value.tsx`, `src/components/evidence/entry-evidence.tsx`, `tests/ui/leaf-citations.test.tsx`.

Touches: `src/components/evidence/cited-value.tsx`, `src/components/evidence/entry-evidence.tsx`, `tests/ui/leaf-citations.test.tsx`, `src/components/knowledge/category-editor.tsx`.

**Dependencies**

- Q106: Consumes interactive keyboard/touch/hover evidence popover and responsive drawer.
- Q104: Consumes current-versus-proposed evidence panel and selected-candidate review wiring. Also consumes prior contents of src/components/knowledge/category-editor.tsx; this shared writer is serialized.
- Q014: Consumes escaped stable-pointer resolver and factual-leaf enumeration.

**Planned verification (not run)**

- Focused deterministic checks for: Every displayed populated business leaf can open its compatible claim evidence; nested summary expansion exposes each nested leaf citation and item IDs need no citation.
- Focused deterministic checks for: Origin badges, unknown coverage explanations and user superseded evidence remain accurate after edits/reorder/revert; factual support never derives from approval alone.
- Focused deterministic checks for: Wire evidence UI into complete editor without duplicating/rewriting source quotes or unsafe previewing logos.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q108 — Prove corrections, re-scrapes and citation interaction

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Add focused review regression coverage independent of the long E2E flow.

Source: Phase 4 Review, corrections and re-scraping (L1414–1416); Focused test inventory (L1443–1443).

**Acceptance criteria / scope in**

- Approval-only revision retains generated origin; correction gets user provenance/supersedes without changing quote; edit resets approval, unknown gender permits review and rejected values are excluded.
- Re-scrape preserves current approved/user content, selected apply creates unreviewed revision and stale old proposals cannot silently overwrite changed state; revert adds revision.
- Array reorder retains citations; hover/focus/tap can enter popover and dismiss correctly; hostile text escapes and unsaved/stale edits survive errors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/integration/review-workflow.test.ts`, `tests/e2e/citation-interaction.spec.ts`.

Touches: `tests/integration/review-workflow.test.ts`, `tests/e2e/citation-interaction.spec.ts`.

**Dependencies**

- Q107: Consumes claim-resolved citation control for every displayed populated business leaf.
- Q100: Consumes history dialog and current-entry restore wiring.
- Q002: Consumes offline test configuration, disposable-database launcher and serialized browser runner.

**Planned verification (not run)**

- Focused deterministic checks for: Approval-only revision retains generated origin; correction gets user provenance/supersedes without changing quote; edit resets approval, unknown gender permits review and rejected values are excluded.
- Focused deterministic checks for: Re-scrape preserves current approved/user content, selected apply creates unreviewed revision and stale old proposals cannot silently overwrite changed state; revert adds revision.
- Focused deterministic checks for: Array reorder retains citations; hover/focus/tap can enter popover and dismiss correctly; hostile text escapes and unsaved/stale edits survive errors.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

## Phase 5: Version management and release acceptance

Acceptance gate (Q124): Stored-version management, owner access/archive and full acceptance pass, with live production host/provider/model gates closed.

Phase completion requires these outcome checks and relevant required deliverables; do not add blanket all-phase dependency edges. Local fixtures do not close live setup gates.

Phase-entry work with only earlier-phase inputs: Q109, Q110, Q111, Q120, Q122

### Q109 — Change company metadata with generation checks

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement protected expected-generation metadata changes while preserving historical metadata.

Source: Table policies and grants (L504–504); API and background-job contracts (L552–552); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Under company lock require owner/editor/unarchived/expectedGeneration; validate name and website syntax/scope using shared policy before protected update.
- A successful name/website change increments generation once and updated_at; stale generation409 and cross-company unavailable never alter data.
- Company ID/creator/counters cannot be client reassigned and old source/snapshot metadata stays frozen.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0022_company_metadata.sql`, `tests/db/company-metadata.test.ts`.

Touches: `supabase/migrations/0022_company_metadata.sql`, `tests/db/company-metadata.test.ts`.

**Dependencies**

- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.
- Q052: Consumes WHATWG URL normalization, allowed document host pair and redirect scope.
- Q036: Consumes atomic publish_knowledge_base, expected generation and locked version allocator.

**Planned verification (not run)**

- Focused deterministic checks for: Under company lock require owner/editor/unarchived/expectedGeneration; validate name and website syntax/scope using shared policy before protected update.
- Focused deterministic checks for: A successful name/website change increments generation once and updated_at; stale generation409 and cross-company unavailable never alter data.
- Focused deterministic checks for: Company ID/creator/counters cannot be client reassigned and old source/snapshot metadata stays frozen.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q110 — Protect owner-only membership management

feature · Rank C · 35 min estimate · gpt-6.1-sol / high effort

Implement set_company_member for existing registered UUIDs with last-owner protection.

Source: Protected functions and trust boundaries (L538–540); API and background-job contracts (L554–554); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Lock company, require unarchived owner and validate target Auth user UUID exists; add/change/remove only via protected function with actor from auth.uid().
- Reject non-owner self-enrollment/promotion and removing/demoting last owner, including concurrent owner operations; no invite/email workflow.
- Membership identity fields remain immutable and removed requester cannot continue worker ingestion/finalization.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0023_membership.sql`, `tests/db/membership.test.ts`.

Touches: `supabase/migrations/0023_membership.sql`, `tests/db/membership.test.ts`.

**Dependencies**

- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.
- Q031: Consumes atomic create_company and creation request replay/rollback behavior.
- Q051: Consumes finish_job and atomic all-or-nothing empty-company initial import.

**Planned verification (not run)**

- Focused deterministic checks for: Lock company, require unarchived owner and validate target Auth user UUID exists; add/change/remove only via protected function with actor from auth.uid().
- Focused deterministic checks for: Reject non-owner self-enrollment/promotion and removing/demoting last owner, including concurrent owner operations; no invite/email workflow.
- Focused deterministic checks for: Membership identity fields remain immutable and removed requester cannot continue worker ingestion/finalization.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q111 — Archive companies without deleting history

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Implement expected-generation owner-only archive and job cancellation.

Source: MVP boundary (L17–17); Permissions (L426–426); API and background-job contracts (L553–553); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Lock company, require owner/current generation and set archive metadata with generation change; cancel active jobs cooperatively and block later mutations/worker finalization.
- Members retain scoped historical read/export, company disappears from normal discovery and no physical company/account/evidence deletion endpoint exists.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0024_archive_company.sql`, `tests/db/archive.test.ts`.

Touches: `supabase/migrations/0024_archive_company.sql`, `tests/db/archive.test.ts`.

**Dependencies**

- Q025: Consumes membership helper, restricted grants and all-seven-table RLS authorization.
- Q047: Consumes protected enqueue/cancel and relational active-job/idempotency checks.
- Q051: Consumes finish_job and atomic all-or-nothing empty-company initial import.

**Planned verification (not run)**

- Focused deterministic checks for: Lock company, require owner/current generation and set archive metadata with generation change; cancel active jobs cooperatively and block later mutations/worker finalization.
- Focused deterministic checks for: Members retain scoped historical read/export, company disappears from normal discovery and no physical company/account/evidence deletion endpoint exists.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q112 — Expose company metadata, membership and archive APIs

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Add validated company management routes over protected functions.

Source: API and background-job contracts (L552–554).

**Acceptance criteria / scope in**

- PATCH validates optional name/website/expectedGeneration and protected URL policy; archive validates generation and members PUT accepts role or remove:true.
- Use caller JWT, owner/editor/owner distinctions and generic cross-tenant404; stale409, last-owner validation and archived write denial are safe.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/api/companies/[companyId]/route.ts`, `src/app/api/companies/[companyId]/archive/route.ts`, `src/app/api/companies/[companyId]/members/[userId]/route.ts`, `tests/api/company-management.test.ts`.

Touches: `src/app/api/companies/[companyId]/route.ts`, `src/app/api/companies/[companyId]/archive/route.ts`, `src/app/api/companies/[companyId]/members/[userId]/route.ts`, `tests/api/company-management.test.ts`.

**Dependencies**

- Q038: Consumes Node auth/validation, safe error envelope, CSRF/origin, size and no-store helpers.
- Q109: Consumes generation-aware protected company name/website mutation.
- Q110: Consumes serialized owner-only set_company_member and last-owner constraint.
- Q111: Consumes owner-only archival/cancellation with retained historical read/export.

**Planned verification (not run)**

- Focused deterministic checks for: PATCH validates optional name/website/expectedGeneration and protected URL policy; archive validates generation and members PUT accepts role or remove:true.
- Focused deterministic checks for: Use caller JWT, owner/editor/owner distinctions and generic cross-tenant404; stale409, last-owner validation and archived write denial are safe.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q113 — Add simple company settings and archive access

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Provide native metadata/member/archive forms and archived-history navigation.

Source: Dashboard at `/dashboard` (L190–190); Permissions (L426–426); Phase 5 Version management and release acceptance (L1422–1422).

**Acceptance criteria / scope in**

- Company settings shows existing-member UUID roster/role controls for owners and name/website editing for owner/editor; last-owner/stale errors keep form inputs.
- Owner archive action removes normal dashboard entry and archived-company screen retains member history/export links with mutations disabled.
- No invitations/email or destructive account/company delete UI; every link/form carries companyId.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/(authenticated)/companies/[companyId]/settings/page.tsx`, `src/app/(authenticated)/archive/page.tsx`, `src/components/company-settings.tsx`, `tests/ui/company-settings.test.tsx`.

Touches: `src/app/(authenticated)/companies/[companyId]/settings/page.tsx`, `src/app/(authenticated)/archive/page.tsx`, `src/components/company-settings.tsx`, `tests/ui/company-settings.test.tsx`, `src/components/company-dashboard.tsx`.

**Dependencies**

- Q112: Consumes protected company metadata/member/archive HTTP operations.
- Q042: Consumes accessible-company dashboard and explicit company switcher navigation. Also consumes prior contents of src/components/company-dashboard.tsx; this shared writer is serialized.
- Q041: Consumes server preview and stored-version publication/list/read/download HTTP contract.

**Planned verification (not run)**

- Focused deterministic checks for: Company settings shows existing-member UUID roster/role controls for owners and name/website editing for owner/editor; last-owner/stale errors keep form inputs.
- Focused deterministic checks for: Owner archive action removes normal dashboard entry and archived-company screen retains member history/export links with mutations disabled.
- Focused deterministic checks for: No invitations/email or destructive account/company delete UI; every link/form carries companyId.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q114 — Finalize snapshot contract and digest integrity checks

feature · Rank C · 40 min estimate · gpt-6.1-sol / high effort

Tighten publication insert validation and parity for complete reviewed drafts.

Source: Revisions and publication transactions (L609–621); Complete illustrative export (L1372–1372); Phase 5 Version management and release acceptance (L1420–1424); Protected functions and trust boundaries (L508–508).

**Acceptance criteria / scope in**

- Direct trusted snapshot insert cannot forge approved manifest, company/source metadata, active claim graph, historical supersedes reference, coverage or canonical digest.
- Full mixed-origin/default/rejected fixture SQL/TypeScript payload parity holds; no full source bodies/errors/secrets/unselected sensitive candidates leak.
- Snapshot values/hashes stay identical after name/website/source-independent draft changes; old schema versions remain readable and never rewritten.
- Protected SQL uses non-login ownership, SECURITY DEFINER with empty search_path, fully qualified objects and explicit least-privilege EXECUTE grants; derive authority from verified caller JWT or restricted worker role, never caller-selected authors.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `supabase/migrations/0025_snapshot_integrity.sql`, `tests/db/snapshot-integrity.test.ts`.

Touches: `supabase/migrations/0025_snapshot_integrity.sql`, `tests/db/snapshot-integrity.test.ts`.

**Dependencies**

- Q035: Consumes protected SQL approved-manifest assembler and frozen-payload parity validation.
- Q101: Consumes protected selected-candidate apply with expected-revision/current-conflict checks.
- Q098: Consumes protected idempotent revert_entry copying history into a new unreviewed revision.
- Q109: Consumes generation-aware protected company name/website mutation.
- Q094: Consumes complete fixture-output acceptance and invalid-model regression cases.

**Planned verification (not run)**

- Focused deterministic checks for: Direct trusted snapshot insert cannot forge approved manifest, company/source metadata, active claim graph, historical supersedes reference, coverage or canonical digest.
- Focused deterministic checks for: Full mixed-origin/default/rejected fixture SQL/TypeScript payload parity holds; no full source bodies/errors/secrets/unselected sensitive candidates leak.
- Focused deterministic checks for: Snapshot values/hashes stay identical after name/website/source-independent draft changes; old schema versions remain readable and never rewritten.

Sizing: One bounded contract, security boundary or transaction; related interfaces stay fixed. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q115 — Browse per-company saved versions and draft

feature · Rank D · 30 min estimate · gpt-6.1-sol / medium effort

Build the stored-version selector and read-only version screen.

Source: View and Manage at `/knowledge/view?companyId=...` (L204–206); Phase 5 Version management and release acceptance (L1422–1424).

**Acceptance criteria / scope in**

- Server-scoped view defaults to latest saved snapshot if present, otherwise clearly labeled draft; selector retains company/version IDs and downloads any saved ID.
- Snapshot view consumes stored payload/frozen citations with no edit/delete; draft edit links target current entry and Remove uses rejected revision.
- Archived members retain history/export, viewer can browse/download, and empty/permission/error states are safe.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/app/(authenticated)/knowledge/view/page.tsx`, `src/components/versions/version-viewer.tsx`, `tests/ui/version-viewer.test.tsx`.

Touches: `src/app/(authenticated)/knowledge/view/page.tsx`, `src/components/versions/version-viewer.tsx`, `tests/ui/version-viewer.test.tsx`.

**Dependencies**

- Q041: Consumes server preview and stored-version publication/list/read/download HTTP contract.
- Q100: Consumes history dialog and current-entry restore wiring.
- Q107: Consumes claim-resolved citation control for every displayed populated business leaf.
- Q113: Consumes company settings and archived-history access screen.

**Planned verification (not run)**

- Focused deterministic checks for: Server-scoped view defaults to latest saved snapshot if present, otherwise clearly labeled draft; selector retains company/version IDs and downloads any saved ID.
- Focused deterministic checks for: Snapshot view consumes stored payload/frozen citations with no edit/delete; draft edit links target current entry and Remove uses rejected revision.
- Focused deterministic checks for: Archived members retain history/export, viewer can browse/download, and empty/permission/error states are safe.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q116 — Render cards, compact table and detailed evidence

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Provide three small presentations of the same selected company/version data.

Source: View and Manage at `/knowledge/view?companyId=...` (L206–206); APA evidence interaction (L212–214).

**Acceptance criteria / scope in**

- Category cards, compact entry table and full detail use one selected payload without reconstruction or differing values.
- Nested leaf evidence remains accessible in every presentation, with honest origin/coverage labels and escaped content.
- Draft edit/remove controls follow role and current revision; snapshot modes remain read-only and stable item ordering is presentation-only.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/components/versions/category-cards.tsx`, `src/components/versions/entry-table.tsx`, `src/components/versions/entry-detail.tsx`, `tests/ui/view-modes.test.tsx`.

Touches: `src/components/versions/category-cards.tsx`, `src/components/versions/entry-table.tsx`, `src/components/versions/entry-detail.tsx`, `tests/ui/view-modes.test.tsx`, `src/components/versions/version-viewer.tsx`.

**Dependencies**

- Q115: Consumes company/version selector and stored-payload read-only view. Also consumes prior contents of src/components/versions/version-viewer.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: Category cards, compact entry table and full detail use one selected payload without reconstruction or differing values.
- Focused deterministic checks for: Nested leaf evidence remains accessible in every presentation, with honest origin/coverage labels and escaped content.
- Focused deterministic checks for: Draft edit/remove controls follow role and current revision; snapshot modes remain read-only and stable item ordering is presentation-only.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q117 — Search and filter the bounded current company view

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Add local search and section/origin/review/coverage filters.

Source: View and Manage at `/knowledge/view?companyId=...` (L206–206).

**Acceptance criteria / scope in**

- Search only selected company values in memory after scoped read; filters compose section/origin/review status/coverage consistently across all three modes.
- Changing company/version resets scoped state correctly and results expose relevant entries/evidence without global search/index services.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `src/knowledge/filter-view.ts`, `src/components/versions/view-filters.tsx`, `tests/knowledge/filter-view.test.ts`.

Touches: `src/knowledge/filter-view.ts`, `src/components/versions/view-filters.tsx`, `tests/knowledge/filter-view.test.ts`, `src/components/versions/version-viewer.tsx`.

**Dependencies**

- Q116: Consumes shared-payload category cards, compact table and full detail presentations. Also consumes prior contents of src/components/versions/version-viewer.tsx; this shared writer is serialized.

**Planned verification (not run)**

- Focused deterministic checks for: Search only selected company values in memory after scoped read; filters compose section/origin/review status/coverage consistently across all three modes.
- Focused deterministic checks for: Changing company/version resets scoped state correctly and results expose relevant entries/evidence without global search/index services.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q118 — Complete publication readiness and stale preview UX

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Integrate all-entry readiness into the existing preview/publication panel.

Source: Scrape and Build at `/knowledge?companyId=...` (L202–202); Phase 5 Version management and release acceptance (L1422–1424).

**Acceptance criteria / scope in**

- Show exact server preview, approved/rejected counts and every unresolved entry; no user-selected approved subset can hide blockers.
- Publish uses preview generation/request ID, returns saved ID/version and links to read-only stored view/download; 409 demands updated preview and keeps edits.
- No network/model work or browser serialization substitutes for protected publication; unknown-containing approved sections remain eligible.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/ui/publication-readiness.test.tsx`.

Touches: `tests/ui/publication-readiness.test.tsx`, `src/components/versions/publish-panel.tsx`.

**Dependencies**

- Q045: Consumes generation-aware preview/publish/download panel in the manual editor. Also consumes prior contents of src/components/versions/publish-panel.tsx; this shared writer is serialized.
- Q115: Consumes company/version selector and stored-payload read-only view.
- Q108: Consumes focused correction/revert/re-scrape/stale-edit and citation interaction acceptance.

**Planned verification (not run)**

- Focused deterministic checks for: Show exact server preview, approved/rejected counts and every unresolved entry; no user-selected approved subset can hide blockers.
- Focused deterministic checks for: Publish uses preview generation/request ID, returns saved ID/version and links to read-only stored view/download; 409 demands updated preview and keeps edits.
- Focused deterministic checks for: No network/model work or browser serialization substitutes for protected publication; unknown-containing approved sections remain eligible.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q119 — Prove snapshot and membership serialization

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Add focused database concurrency/idempotency tests outside the UI E2E.

Source: Revisions and publication transactions (L607–619); Phase 5 Version management and release acceptance (L1424–1424); Focused test inventory (L1439–1440).

**Acceptance criteria / scope in**

- Concurrent saves/publish place each revision wholly before or after snapshot; expected revision/generation mismatches fail, and no partially approved state appears.
- Matching publication/revision replays do not duplicate, changed bodies conflict and concurrent distinct publications get sequential unique versions via locked counter.
- Concurrent owner removal/demotion cannot eliminate last owner; foreign-key/Auth deletion restrictions and archived/removed-user worker denial remain enforced.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/integration/transaction-concurrency.test.ts`.

Touches: `tests/integration/transaction-concurrency.test.ts`.

**Dependencies**

- Q114: Consumes final frozen manifest/claim/evidence/default/digest validators.
- Q110: Consumes serialized owner-only set_company_member and last-owner constraint.
- Q111: Consumes owner-only archival/cancellation with retained historical read/export.
- Q036: Consumes atomic publish_knowledge_base, expected generation and locked version allocator.

**Planned verification (not run)**

- Focused deterministic checks for: Concurrent saves/publish place each revision wholly before or after snapshot; expected revision/generation mismatches fail, and no partially approved state appears.
- Focused deterministic checks for: Matching publication/revision replays do not duplicate, changed bodies conflict and concurrent distinct publications get sequential unique versions via locked counter.
- Focused deterministic checks for: Concurrent owner removal/demotion cannot eliminate last owner; foreign-key/Auth deletion restrictions and archived/removed-user worker denial remain enforced.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q120 — Document and configure persistent native service deployment

chore · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Create a provider-specific deployment runbook after the host choice is supplied.

Source: Fixed decisions and verification gates (L23–32); Components (L43–48); Setup required before implementation and release (L1478–1482).

**Acceptance criteria / scope in**

- Owner-selected host configuration starts persistent web/independent worker and separate renderer/proxy with restart/resource limits, secret separation and private channel; never scale worker to zero with queued work.
- Document build/migrate/start/stop-by-exact-service operations, restricted DB role/TLS/connection behavior, Auth redirects and secret injection without storing credentials.
- No Docker/Guild dependency; keep unresolved provider-specific values blocked rather than inventing commands, permissions or a working firewall.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `docs/deployment.md`, `deploy/service-contract.json`.

Touches: `docs/deployment.md`, `deploy/service-contract.json`.

**Dependencies**

- Q067: Consumes persistent claim/heartbeat/work/shutdown lifecycle.
- Q058: Consumes accepted real-topology non-Docker egress/sandbox qualification gate before arbitrary URLs.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.
- Q001: Consumes pinned package/compiler environment and documented command entry points.

**Planned verification (not run)**

- Focused deterministic checks for: Owner-selected host configuration starts persistent web/independent worker and separate renderer/proxy with restart/resource limits, secret separation and private channel; never scale worker to zero with queued work.
- Focused deterministic checks for: Document build/migrate/start/stop-by-exact-service operations, restricted DB role/TLS/connection behavior, Auth redirects and secret injection without storing credentials.
- Focused deterministic checks for: No Docker/Guild dependency; keep unresolved provider-specific values blocked rather than inventing commands, permissions or a working firewall.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

Setup gate: `production_deployment`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

### Q121 — Expose minimal worker and queue failure visibility

feature · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Add bounded operational health summaries without another monitoring service.

Source: Setup required before implementation and release (L1482–1482); Phase 5 Version management and release acceptance (L1422–1422).

**Acceptance criteria / scope in**

- Restricted operational check reports oldest queued age, expired lease count, terminal failure rate and worker heartbeat/health with sanitized output.
- Runbook names host-native restart and managed backup enablement/restore checks; access is internal/operator-only and no cross-company public health detail leaks.
- Use existing scrape_jobs and worker state, polling/CLI sufficient; no extra tables, Realtime or observability platform.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `scripts/check-worker-health.mjs`, `docs/operations.md`, `tests/worker/health-summary.test.ts`.

Touches: `scripts/check-worker-health.mjs`, `docs/operations.md`, `tests/worker/health-summary.test.ts`.

**Dependencies**

- Q067: Consumes persistent claim/heartbeat/work/shutdown lifecycle.
- Q120: Consumes selected-provider persistent service/secret/restart and migration contract.

**Planned verification (not run)**

- Focused deterministic checks for: Restricted operational check reports oldest queued age, expired lease count, terminal failure rate and worker heartbeat/health with sanitized output.
- Focused deterministic checks for: Runbook names host-native restart and managed backup enablement/restore checks; access is internal/operator-only and no cross-company public health detail leaks.
- Focused deterministic checks for: Use existing scrape_jobs and worker state, polling/CLI sufficient; no extra tables, Realtime or observability platform.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q122 — Qualify the configured model on the controlled fixture

chore · Rank D · 25 min estimate · gpt-6.1-sol / medium effort

Record live strict-output compatibility and fixture accuracy before release.

Source: Fixed decisions and verification gates (L26–32); Phase 0 Establish contracts and runtime (L1382–1384); Setup required before implementation and release (L1478–1480).

**Acceptance criteria / scope in**

- With owner-provided configured credentials/model, one bounded fixture run proves strict schema support, refusals/incomplete handling and semantic citation/origin checks; no live call becomes CI dependency.
- Record exact model/prompt/schema versions, configured token/time ceiling, results and unsupported provider failure; unresolved capabilities block release instead of inventing a substitute.
- No secret/full prompt in report; cost/token figures are reported only when actual telemetry exists.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `scripts/qualify-model.mjs`, `docs/model-qualification.md`.

Touches: `scripts/qualify-model.mjs`, `docs/model-qualification.md`.

**Dependencies**

- Q094: Consumes complete fixture-output acceptance and invalid-model regression cases.
- Q003: Consumes explicit owner/provider configuration requirements and unclosed capability gates.

**Planned verification (not run)**

- Focused deterministic checks for: With owner-provided configured credentials/model, one bounded fixture run proves strict schema support, refusals/incomplete handling and semantic citation/origin checks; no live call becomes CI dependency.
- Focused deterministic checks for: Record exact model/prompt/schema versions, configured token/time ceiling, results and unsupported provider failure; unresolved capabilities block release instead of inventing a substitute.
- Focused deterministic checks for: No secret/full prompt in report; cost/token figures are reported only when actual telemetry exists.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

Setup gate: `live_model_qualification`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

### Q123 — Prove the one essential seven-category E2E flow

feature · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Implement the single bounded UI scenario backed by fixture services and recorded model output.

Source: One essential end-to-end scenario (L1447–1459); Definition of done (L1486–1488).

**Acceptance criteria / scope in**

- OwnerA creates company, scrapes fixture, refreshes progress and opens all seven categories with honest unknowns/source/technical citations and no logo-implied partnership.
- Resolve address conflict, user-correct, approve generated pitch/desired entries and reject others, publish/download and validate full schema/stable pointers/provenance with no bodies/logs/secrets.
- Later approved edit becomes unreviewed and re-scrape cannot overwrite it or saved canonical payload/hash; companyB user is unavailable via HTTP/RPC/database and companyA viewer downloads but cannot mutate.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `tests/e2e/company-knowledge.spec.ts`.

Touches: `tests/e2e/company-knowledge.spec.ts`.

**Dependencies**

- Q118: Consumes complete draft-readiness preview and saved version navigation.
- Q069: Consumes refresh-safe company/job polling and progress panel wired into the editor.
- Q086: Consumes durable all-category page extraction, checkpoint/reduce/finalize pipeline.
- Q002: Consumes offline test configuration, disposable-database launcher and serialized browser runner.

**Planned verification (not run)**

- Focused deterministic checks for: OwnerA creates company, scrapes fixture, refreshes progress and opens all seven categories with honest unknowns/source/technical citations and no logo-implied partnership.
- Focused deterministic checks for: Resolve address conflict, user-correct, approve generated pitch/desired entries and reject others, publish/download and validate full schema/stable pointers/provenance with no bodies/logs/secrets.
- Focused deterministic checks for: Later approved edit becomes unreviewed and re-scrape cannot overwrite it or saved canonical payload/hash; companyB user is unavailable via HTTP/RPC/database and companyA viewer downloads but cannot mutate.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

### Q124 — Close release gates with exact-environment evidence

chore · Rank D · 35 min estimate · gpt-6.1-sol / medium effort

Collect final MVP acceptance and real-host qualification evidence without overstating local proof.

Source: Phase 5 Version management and release acceptance (L1422–1424); Material risks and controls (L1461–1474); Setup required before implementation and release (L1476–1488).

**Acceptance criteria / scope in**

- Run documented typecheck/build, focused deterministic suites, disposable DB concurrency/access and the single fixture E2E against exact candidate; list executed/skipped/failed separately.
- Verify real-host proxy/firewall confinement with hook bypass, Chromium sandbox/resources/restart, no renderer secrets/internal access, managed backups/connection limits/TLS/Auth and patched runtime support.
- Owner-authorized real company/model smoke satisfies definition of done; unresolved host/model/provider capability is a release blocker, and current local/browser smoke never establishes production confinement.

**Scope out**

- Unrelated refactors and optional post-MVP features

**Files**

Creates: `docs/release-acceptance.md`.

Touches: `docs/release-acceptance.md`.

**Dependencies**

- Q123: Consumes the bounded owner scrape/review/publish/immutability/two-tenant/viewer acceptance flow.
- Q117: Consumes local company/version-scoped search and filter predicates.
- Q119: Consumes focused save/publication/replay/last-owner serialization evidence.
- Q071: Consumes real-topology application-hook-bypass and SSRF escape-denial evidence.
- Q070: Consumes worker restart/lease/cancel/requester-removal recovery evidence.
- Q122: Consumes exact configured model/API live-fixture semantic qualification evidence.
- Q121: Consumes operator-only queue/lease/failure/worker summary and backup/restart runbook.
- Q120: Consumes selected-provider persistent service/secret/restart and migration contract.
- Q001: Consumes pinned package/compiler environment and documented command entry points.

**Planned verification (not run)**

- Focused deterministic checks for: Run documented typecheck/build, focused deterministic suites, disposable DB concurrency/access and the single fixture E2E against exact candidate; list executed/skipped/failed separately.
- Focused deterministic checks for: Verify real-host proxy/firewall confinement with hook bypass, Chromium sandbox/resources/restart, no renderer secrets/internal access, managed backups/connection limits/TLS/Auth and patched runtime support.
- Focused deterministic checks for: Owner-authorized real company/model smoke satisfies definition of done; unresolved host/model/provider capability is a release blocker, and current local/browser smoke never establishes production confinement.

Sizing: One routine behavior with a finite input and failure surface. Unmeasured planning estimate for one focused attempt; split again if implementation reveals a separate concern.

Dispatch: Owns the exact new files listed; may run beside ready quests with disjoint touches. Model recommendation: Focused implementation; high effort reserved for semantic/security/transaction boundaries.

Setup gate: `release_acceptance`. Completion requires concrete evidence; do not mark implemented/proven from this planning entry.

## Traceability

Every row below maps to explicit Quest IDs. Lines refer to `docs/implementation-plan.md` at the pinned base.

### Fields

| Requirement | Source lines | Quests |
| --- | --- | --- |
| /company_foundation/overview | L110–110 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/website | L111–111 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/industry | L112–112 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/business_model | L113–113 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/company_role | L114–114 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/year_founded | L115–115 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/legal_entity_type | L116–116 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/employee_count | L117–117 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/main_address | L118–118 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/other_locations | L119–119 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/service_locations | L120–120 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /company_foundation/alternative_company_names | L121–121 | Q007, Q074, Q044, Q013, Q015, Q029, Q083, Q094 |
| /positioning/company_pitch | L127–127 | Q008, Q074, Q087, Q013, Q015, Q029, Q083, Q094 |
| /positioning/founding_story | L128–128 | Q008, Q074, Q087, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/target_buyers | L134–134 | Q009, Q075, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/customer_needs | L135–135 | Q009, Q075, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/ideal_customer_personas | L136–136 | Q009, Q075, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/industry_groupings | L137–137 | Q009, Q075, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/industry_outlook | L138–138 | Q009, Q075, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/channels | L139–139 | Q009, Q076, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/funnels | L140–140 | Q009, Q076, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/ctas | L141–141 | Q009, Q076, Q088, Q013, Q015, Q029, Q083, Q094 |
| /market_and_customers/suppliers_and_partners | L142–142 | Q009, Q076, Q088, Q013, Q015, Q029, Q083, Q094 |
| /branding_and_style/writing_style_description | L148–148 | Q010, Q080, Q089, Q013, Q015, Q029, Q083, Q094 |
| /branding_and_style/art_style_description | L149–149 | Q010, Q080, Q089, Q013, Q015, Q029, Q083, Q094 |
| /branding_and_style/fonts | L150–150 | Q010, Q077, Q089, Q013, Q015, Q029, Q083, Q094 |
| /branding_and_style/brand_colors | L151–151 | Q010, Q078, Q089, Q013, Q015, Q029, Q083, Q094 |
| /branding_and_style/logos | L152–152 | Q010, Q079, Q089, Q013, Q015, Q029, Q083, Q094 |
| /online_presence/social_media_links | L158–158 | Q010, Q079, Q090, Q013, Q015, Q029, Q083, Q094 |
| /key_people/@id/name | L166–166 | Q011, Q081, Q091, Q013, Q015, Q029, Q083, Q094 |
| /key_people/@id/title | L167–167 | Q011, Q081, Q091, Q013, Q015, Q029, Q083, Q094 |
| /key_people/@id/role | L168–168 | Q011, Q081, Q091, Q013, Q015, Q029, Q083, Q094 |
| /key_people/@id/gender | L169–169 | Q011, Q081, Q091, Q013, Q015, Q029, Q083, Q094 |
| /key_people/@id/background_or_relevance | L170–170 | Q011, Q081, Q091, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/name | L178–178 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/description | L179–179 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/offering_type | L180–180 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/category | L181–181 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/features | L182–182 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/pricing | L183–183 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |
| /offerings/@id/url | L184–184 | Q011, Q082, Q092, Q013, Q015, Q029, Q083, Q094 |

### Tables

| Requirement | Source lines | Quests |
| --- | --- | --- |
| companies | L229–229 | Q018, Q024, Q025, Q026, Q046 |
| company_members | L246–246 | Q018, Q024, Q025, Q026, Q046 |
| scrape_jobs | L257–257 | Q019, Q024, Q025, Q026, Q046 |
| source_pages | L299–299 | Q019, Q024, Q025, Q026, Q046 |
| knowledge_entries | L332–332 | Q020, Q024, Q025, Q026, Q046 |
| knowledge_entry_versions | L348–348 | Q020, Q024, Q025, Q026, Q046 |
| knowledge_base_versions | L373–373 | Q021, Q024, Q025, Q026, Q046 |

### Protected Functions

| Requirement | Source lines | Quests |
| --- | --- | --- |
| create_company | L511–538 | Q031 |
| set_company_member | L538–538 | Q110 |
| save_entry_revision | L540–540 | Q033 |
| apply_proposal | L540–540 | Q101 |
| revert_entry | L540–540 | Q098 |
| publish_knowledge_base | L540–540 | Q036 |
| claim_job | L542–542 | Q048 |
| heartbeat_job | L542–542 | Q048 |
| insert_source_capture | L542–542 | Q050 |
| checkpoint_job | L542–542 | Q049 |
| finish_job | L542–542 | Q051 |
| fail_job | L542–542 | Q049 |
| private.company_role | L458–466 | Q025 |
| create_entry_revision (proposed protected operation name) | L559–559 | Q032 |
| change_company_website / metadata (proposed operation name) | L504–504 | Q109 |
| archive_company (proposed operation name) | L553–553 | Q111 |
| enqueue_scrape (proposed operation name) | L555–555 | Q047 |
| cancel_scrape (proposed operation name) | L557–557 | Q047 |
| dismiss_proposal (proposed operation name) | L563–563 | Q102 |
| private.validate_content / claims / evidence (proposed helper names) | L411–411 | Q030, Q028, Q029 |
| private.assemble_snapshot (proposed helper name) | L616–619 | Q035 |

### Api Routes

| Requirement | Source lines | Quests |
| --- | --- | --- |
| POST /api/companies | L550–550 | Q039, Q038 |
| GET /api/companies | L551–551 | Q039, Q038 |
| PATCH /api/companies/:c | L552–552 | Q112, Q038 |
| POST /api/companies/:c/archive | L553–553 | Q112, Q038 |
| PUT /api/companies/:c/members/:u | L554–554 | Q112, Q038 |
| POST /api/companies/:c/scrapes | L555–555 | Q068, Q038 |
| GET /api/companies/:c/scrapes/:j | L556–556 | Q068, Q038 |
| POST /api/companies/:c/scrapes/:j/cancel | L557–557 | Q068, Q038 |
| GET /api/companies/:c/draft | L558–558 | Q040, Q038 |
| POST /api/companies/:c/entries | L559–559 | Q040, Q038 |
| POST /api/companies/:c/entries/:e/revisions | L560–560 | Q040, Q038 |
| POST /api/companies/:c/entries/:e/revert | L561–561 | Q099, Q038 |
| POST /api/companies/:c/proposals/:p/apply | L562–562 | Q103, Q038 |
| POST /api/companies/:c/proposals/:p/dismiss | L563–563 | Q103, Q038 |
| GET /api/companies/:c/entries/:e/history | L564–564 | Q099, Q038 |
| GET /api/companies/:c/preview | L565–565 | Q041, Q038 |
| POST /api/companies/:c/versions | L566–566 | Q041, Q038 |
| GET /api/companies/:c/versions | L567–567 | Q041, Q038 |
| GET /api/companies/:c/versions/:v | L568–568 | Q041, Q038 |
| GET /api/companies/:c/versions/:v/download | L569–569 | Q041, Q038 |

### Requirements

| Requirement | Source lines | Quests |
| --- | --- | --- |
| MVP-ARCH: One Next15/Node22 app, persistent Node worker, Supabase/Auth, hooks/context/Tailwind/BEM; direct execution and no extra queue | L3–32 | Q001, Q022, Q043, Q019, Q067, Q120 |
| MVP-ENTRY: Five singleton kinds and separate people/offerings; stable IDs, defaults and no destructive history | L17–17 | Q013, Q020, Q026, Q032, Q033, Q051, Q111 |
| AUTH-TENANT: Owner/editor/viewer and unavailable cross-company HTTP/RPC/table and JSON references | L415–542 | Q025, Q030, Q038, Q046, Q123 |
| AUTH-PRIVILEGE: Dedicated non-login owner, fixed search_path, restricted worker functions, no renderer secrets/authority spoofing | L508–542 | Q018, Q025, Q048, Q064, Q056, Q120 |
| AUTH-WEB: Verified session, CSRF/origin validation, no-store tenant data and body/rate limits | L98–98 | Q037, Q038, Q047, Q068 |
| COMPANY-LIFECYCLE: Atomic idempotent first owner, metadata generation, last-owner concurrent protection and read-preserving owner archive | L504–540 | Q031, Q109, Q110, Q111, Q119, Q113 |
| CRAWL-BUDGETS: 10 docs/depth2/3 HTTP/1 render/500ms/15s/25s/5min/2MiB/100k chars/15MiB; max25/depth3/candidates200 | L64–74 | Q060, Q061, Q063, Q066 |
| CRAWL-SCOPE: Normalization, bare/www offline suffix scope, exact subdomain, effective root/redirect aliases and canonical metadata only | L66–70 | Q052, Q060, Q054 |
| CRAWL-ROBOTS: Identifiable robots per origin, finite status/retry/rate handling, no auth/CAPTCHA/form bypass | L72–74 | Q059, Q057, Q070 |
| QUEUE-DURABLE: SKIP LOCKED, 60s lease/15s heartbeat, unexpired token fences, <=3 attempts, one active company/claimed worker job | L74–78 | Q047, Q048, Q049, Q067, Q070 |
| QUEUE-IMPORT: Checkpoint/source reuse, atomic idempotent all-or-nothing empty-company first import; existing/human draft stays proposal-only | L597–599 | Q050, Q051, Q066, Q086, Q070 |
| QUEUE-CANCEL: Cancelled job retains captures without partial import; removed requester/archive blocks processing/finalization | L542–599 | Q047, Q049, Q051, Q111, Q070 |
| PROGRESS: Real persisted counts and stage, 2s active polling/backoff/terminal stop, company/job URL recovery | L76–76 | Q012, Q049, Q068, Q069 |
| NET-SSRF: All A/AAAA global-only, mixed/special/mapped denial, DNS-rebinding pinning and TLS/SNI, five manually checked redirects | L94–94 | Q053, Q054, Q052, Q071 |
| NET-ENFORCED: Every renderer/fetch/asset connection forced through public-only proxy; deny direct DNS/TCP/UDP/QUIC/internal access even if hooks bypassed | L96–96 | Q004, Q055, Q057, Q058, Q071, Q124 |
| NET-RENDERER: Private authenticated secret-free separate renderer; fresh context, sandbox/resources, no SW/WebRTC/WS/download, CDN-only asset exception | L44–48 | Q056, Q057, Q063, Q120, Q058 |
| CAPTURE-IMMUTABLE: Bounded sanitized plain text/segments, observed metadata/JSONLD/links/CTA/style, finalize only after render, immutable source/hash | L82–86 | Q062, Q063, Q050, Q026 |
| MODEL-UNTRUSTED: Tool-free sanitized untrusted envelope, Responses strict Zod output then semantic checks, bounded task/retry and honest refusal/incomplete failures | L88–90 | Q072, Q073, Q083, Q122 |
| MODEL-CONFLICT: Identical facts combine evidence, differing candidates conflict; no confidence/recency preference or same-name auto-merge | L90–90 | Q084, Q081, Q082, Q096 |
| FIELDS-COMPLETE: All 41 fields attempted, strict nested values, origin field permissions, null/[] defaults and exactly-once coverage independent of review | L100–184 | Q013, Q015, Q083, Q094 |
| FIELDS-CAUTION: No inferred legal/founding/headquarters/exact employees/gender; website-only outlook, lossless numeric pricing and raw employee wording | L110–184 | Q006, Q074, Q081, Q082, Q029, Q094 |
| STYLE-OBSERVED: Separate CSS-declared/loaded/computed fonts, RGB/HSL/alpha colors/brand role, logo context and no SVG export | L84–86 | Q077, Q078, Q079, Q080, Q089, Q090, Q091 |
| PROVENANCE-PATHS: Stable escaped @UUID pointers, repeatable IDs/reorder/removed IDs, every populated factual leaf compatible claim except metadata IDs | L623–629 | Q014, Q015, Q028, Q107, Q095 |
| PROVENANCE-INTEGRITY: Same-company captured sources, URL/time/quote/technical identity, claim DAG/support and separate historical supersedes references | L411–413 | Q030, Q029, Q073, Q114 |
| REVIEW-SAVES: Explicit save/review/clear/reject/revert append revisions, edit resets approval, approval retains origin and user correction supersedes original quote | L605–607 | Q033, Q095, Q098, Q097, Q108 |
| REVIEW-CONFLICTS: Material conflict decision before approve; singleton/person/offering review units, unknowns eligible and rejection retains defaults/coverage | L198–200 | Q096, Q097, Q034, Q035 |
| REVIEW-PROPOSALS: Current/proposed evidence, selected apply at expected current revision and fresh conflicts; dismiss decision only, no automatic overwrite | L200–200 | Q101, Q102, Q103, Q104, Q108 |
| REVIEW-IDEMPOTENCY: Revision operation UUID/body check under company lock; job/snapshot relational keys and 409 stale edits preserve unsaved input | L571–571 | Q032, Q033, Q047, Q036, Q043, Q119 |
| APA-OBSERVED: Observed author/date or title/n.d., deterministic year suffix, full reference/retrieval semantics and honest user/generated/inferred labels | L208–214 | Q105, Q106, Q107 |
| UI-ACCESSIBLE: Every factual leaf evidence, interactive hover/focus/tap popover/drawer, Escape/outside dismissal, safe escaped text/links/logo handling | L98–98 | Q106, Q107, Q108, Q123 |
| UI-STATES: Seven tabs/review coverage, all crawl/save/stale/conflict/review/publication states, viewer controls and unsaved-warning persistence | L194–202 | Q043, Q069, Q093, Q097, Q118 |
| VERSIONS-ATOMIC: Company lock, expected generation, all current entries resolved, >=1 approved, frozen manifest/default assembly and atomic version counter | L609–619 | Q036, Q035, Q114, Q119 |
| VERSIONS-FROZEN: Frozen company/source citation metadata, canonical UTF8 payload/hash, stable item order, safe name and stored-version-only read/download; no old-schema migration | L613–621 | Q034, Q035, Q041, Q114, Q115 |
| VERSIONS-MODES: Latest snapshot/draft selector, cards/table/detail/evidence, local scoped search/section-origin-review-coverage filters | L204–206 | Q115, Q116, Q117 |
| TEST-FOCUSED: Deterministic HTML/CSS/JSONLD and recorded models, disposable DB, isolated fixture egress, proportional boundary cases and one E2E | L1428–1459 | Q002, Q024, Q016, Q017, Q046, Q094, Q108, Q119, Q071, Q123 |
| SETUP-RELEASE: Auth/Supabase/model/private renderer config, patched pinned runtime, support/TLS/connections/terms, secrets/backup/restart/health and real-host proof | L1476–1482 | Q003, Q023, Q058, Q120, Q121, Q122, Q124 |
| DONE: Real company scrape to all-category evidenced review/immutable snapshot/download with tenant/viewer protection and honest undisclosed facts | L1486–1488 | Q123, Q124 |

### E2E Assertions

| Requirement | Source lines | Quests |
| --- | --- | --- |
| E2E-1: OwnerA sign-in, company creation and initial owner | L1451–1451 | Q037, Q031, Q123 |
| E2E-2: Fixture scrape, refresh and durable partial/completed progress | L1452–1452 | Q069, Q067, Q070, Q123 |
| E2E-3: Seven categories/required keys/text+technical citation/absent facts/no logo-implied partner | L1453–1453 | Q094, Q093, Q107, Q123 |
| E2E-4: Resolve conflict, user correct, approve generated pitch/desired entries/reject rest; unknown gender eligible | L1454–1454 | Q096, Q097, Q108, Q123 |
| E2E-5: Publish/download full schema/stable pointer/provenance, no internal bodies/logs/secrets | L1455–1455 | Q036, Q041, Q114, Q123 |
| E2E-6: Later edit unreviewed; canonical snapshot/hash unchanged after edit/re-scrape; edited value not overwritten | L1456–1456 | Q108, Q114, Q123 |
| E2E-7: CompanyB HTTP/RPC/database isolation and companyA viewer download with no mutation | L1457–1457 | Q046, Q025, Q123 |

## Planning validation diagnostics

These checks validate the plan data, not application behavior.

- quest_count: 124
- counts_by_phase: {'0': 23, '1': 23, '2': 25, '3': 23, '4': 14, '5': 16}
- counts_by_rank: {'C': 22, 'D': 96, 'E': 6}
- dependency_edges: 295
- longest_dependency_chain_quests: 27
- largest_topological_level: 14
- largest_topological_level_note: A same-depth antichain after predecessor completion, not a claimed measured maximum concurrency or host dispatch recommendation.
- entry_ready_quests: ['Q001', 'Q003', 'Q018']
- unique_created_paths: 317
- shared_write_paths: 8
- coverage: {'fields': 41, 'tables': 7, 'protected_functions': 21, 'api_routes': 20, 'requirements': 37, 'e2e_assertions': 7}
- checks: {'schema_required_keys_and_enums': 'pass', 'ids_unique_and_contiguous': 'pass', 'dependency_ids_reasons_acyclic': 'pass', 'source_ranges_and_exact_headings': 'pass', 'creates_unique_touches_available_from_base_self_or_ancestor': 'pass', 'overlapping_writers_serialized': 'pass', 'field_table_route_function_inventory_coverage': 'pass', 'all_verification_planned_not_run': 'pass', 'markdown_rendered_from_same_data': 'pass'}
- implementation_status: NOT_IMPLEMENTED
- application_tests: NOT_RUN
- live_host_model_provider_qualification: NOT_PROVEN

No application tests, migrations, services, live model calls, host/network qualification, commits, pushes or publication were performed for this deliverable.
