# Durable worker

Run `npm run worker` as an independent persistent Node 22 process. Configure `WORKER_DATABASE_URL` for a dedicated PostgreSQL login granted only the `moflo_worker` group. It must not own tables or have direct table access. Web operations use the authenticated caller's Supabase JWT and never this connection.

The worker claims one job, renews its 60-second lease every 15 seconds, and passes company/job/token to every protected write. A lost lease aborts work and prevents a terminal write by the superseded attempt. SIGTERM/SIGINT stop network work; an unfinished lease can be reclaimed. Claims supply immutable source captures and current entry summaries transiently. Checkpoints contain the frontier, consumed budgets, safe errors, completed source IDs and compact validated candidates; source bodies remain in source rows.

HTTP/renderer work uses the network lane's pinned public-address transport, robots cache, normalized frontier and bounded scheduler. A rendered capture is finalized before source insertion. Missing renderer configuration preserves honest partial coverage. Production browser isolation requires the renderer qualification report described in `src/renderer/README.md`.

Extraction is deterministic: the worker derives supported candidates from captured page content and technical observations, validates their evidence locally, and reduces matches or conflicts into review proposals. It does not call an AI/model service, generate content, or require model credentials. Supported fields and evidence types are listed in [the no-AI product scope](../../docs/no-ai-redesign.md). Unsupported or inconclusive fields remain unknown for human review. Historical generated-origin records remain available to read and display; current extraction does not create generated values.

Finalization is a protected SQL transaction: an empty company receives unreviewed entries once; any existing human draft makes the job proposal-only. Publication remains an explicit member review operation. Saved snapshots never depend on current worker state.
