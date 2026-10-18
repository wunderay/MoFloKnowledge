# Canonical domain contracts

`index.ts` is safe in browsers and workers. Business values follow the validation contract implemented by the schemas in this folder. Every object is strict; all business keys are required, unknown scalar values are `null`, and empty collections are `[]`. Empty people/offerings are editor drafts only and cannot be persisted. Defaults never manufacture facts.

The implementation is partitioned by rule:

| Rule | Implementation |
| --- | --- |
| Reusable primitives and nested structures | `primitives.ts`, `value-types.ts` |
| Employee/pricing semantics | `numeric-values.ts` |
| Seven categories, plus the optional `site_links` singleton (`site-links.ts`) and the model fields (revenue, phone, person age/nationality/portrait, offering images; storage references in `storage-ref.ts`) | category schemas and `field-registry.json` |
| Source/claim/export shapes | `provenance.ts`, `knowledge-base.ts` |
| Stable identity and pointers | `stable-pointer.ts` |
| Compatible factual leaf claims, complete coverage and support graph | `validate-provenance.ts` |
| Immutable defaults, approved assembly and canonical exports | `../knowledge/assemble.ts`, `canonical-json.ts`, `download-name.ts` |
| Changed leaf provenance and explicit review | `../knowledge/revise-provenance.ts` |
| Bounded human choices | `../knowledge/conflict-decisions.ts` |
| APA and honest attribution | `../knowledge/apa.ts` |
| Scoped in-memory filters | `../knowledge/filter-view.ts` |

Stable pointers apply RFC 6901 escaping to object keys, followed by `@<uuid>` segments for identified business array elements. Positional indices are allowed for fixed enum metadata such as font observations. They are application pointers, not ordinary JSON Pointer. All populated scalar leaves, including booleans and nested observation metadata, need a compatible claim. IDs need none.

`validateProvenance` returns actionable issues; `assertValidProvenance` throws. Supply authoritative captured sources to verify exact quotes/observations and frozen source metadata. Supply historical claim IDs for supersedes checks. Per-entry validation can receive `supportingClaims` from authoritative same-company immutable revisions to resolve generated cross-entry facts without importing foreign active targets. First import supplies the complete validated same-company proposal batch as trusted lookup context. Snapshot validation supplies no external claims: all dependencies must resolve inside its approved current manifest, and preview reports stale/unapproved support as a publication blocker. These optional inputs separate pure schema validation from privileged database lookups; callers must perform the matching SQL validation before persistence. Tenancy is always enforced by protected database functions, never by these pure helpers alone.

`json-schemas.json`, `defaults.json`, and `field-registry.json` support generated SQL parity. The JSON Schema is a structural boundary; refinements such as employee-range honesty, exact decimal ordering, unique stable IDs, claim graphs, compatible origins, coverage cardinality and human conflict resolution are additionally enforced by TypeScript and protected SQL validators. Regenerate schemas from the exported Zod schemas whenever structure changes.

Canonical export JSON sorts object keys by UTF-16 code-unit order, preserves array order, has no insignificant whitespace, and uses `JSON.stringify` primitive escaping/number rendering. It rejects undefined, cycles, non-finite numbers and non-JSON objects. SHA-256 hashes the UTF-8 encoding of those exact bytes. Download names derive from the frozen company name.

Focused verification: `npm run unit -- tests/contracts tests/knowledge` plus `npm run typecheck`. The complete illustrative export is kept in tests as a realistic fixture.

Rendered capture observations in `render-task.ts` include final visible anchors/labels, forms, CTA destinations, headings, addresses and price text plus observed metadata/JSON-LD. Each collection has strict nested keys and bounded text/counts; optional properties retain compatibility with historical captures. The renderer always populates them, follows no CTA/form, and exports no submitted form values. `captureHtml` prefers final rendered observations and retains selected actual visible text as exact source segments, so JavaScript-only facts can receive verified evidence.

Re-scrape proposals expose optional/default-empty `changes: [{id, target}]` metadata for selecting ordinary populated fields. Targets must be exact top-level registry fields belonging to the proposal kind and resolving in its existing content; conflict fields use their separate candidate IDs. IDs/targets are unique, and changes duplicate no values, evidence or source authority. Application still reads the immutable proposal content/provenance and applies only explicitly selected target IDs.

`CitationContextSchema` defines a separate read-only `{claims,evidence,sources}` lookup for company-scoped citation display. It uses the canonical constituent schemas, unique IDs per collection, and a 10,000-item ceiling per array. A generated claim's nonempty direct evidence does not guarantee closure over every supporting claim; the presentation can consult this context without adding foreign targets to active entry provenance. Context is never persisted or accepted as write authority.

Non-homepage rendering also detects bounded unfinished client sections beside substantial server-rendered text: executable scripts plus loading placeholders or empty named business sections (for example FAQ/pricing/team). A script tag alone does not cause every page to render. The existing `requiresRender` signal carries this decision to the worker without a second caller flag.
