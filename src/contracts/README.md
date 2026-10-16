# Canonical domain contracts

`index.ts` is safe in browsers and workers. Business values exactly follow the reusable validation contract in `docs/implementation-plan.md` (lines 635–774). Every object is strict; all business keys are required, unknown scalar values are `null`, and empty collections are `[]`. Empty people/offerings are editor drafts only and cannot be persisted. Defaults never manufacture facts.

The implementation is partitioned by source rule:

| Plan rule | Implementation |
| --- | --- |
| Reusable primitives and nested structures, 635–680 | `primitives.ts`, `value-types.ts` |
| Employee/pricing semantics, 646–649, 685–691, 770 | `numeric-values.ts` |
| Seven categories, 106–184, 697–716 | category schemas and `field-registry.json` |
| Source/claim/export shapes, 717–767 | `provenance.ts`, `knowledge-base.ts` |
| Stable identity and pointers, 623–631 | `stable-pointer.ts` |
| Compatible factual leaf claims, complete coverage and support graph, 770–774 | `validate-provenance.ts` |
| Immutable defaults, approved assembly and canonical exports, 609–621 | `../knowledge/assemble.ts`, `canonical-json.ts`, `download-name.ts` |
| Changed leaf provenance and explicit review, 605–607 | `../knowledge/revise-provenance.ts` |
| Bounded human choices, 90, 198–200, 631 | `../knowledge/conflict-decisions.ts` |
| APA and honest attribution, 208–214 | `../knowledge/apa.ts` |
| Scoped in-memory filters, 206 | `../knowledge/filter-view.ts` |

Stable pointers apply RFC 6901 escaping to object keys, followed by `@<uuid>` segments for identified business array elements. Positional indices are allowed for fixed enum metadata such as font observations. They are application pointers, not ordinary JSON Pointer. All populated scalar leaves, including booleans and nested observation metadata, need a compatible claim. IDs need none.

`validateProvenance` returns actionable issues; `assertValidProvenance` throws. Supply authoritative captured sources to verify exact quotes/observations and frozen source metadata. Supply historical claim IDs for supersedes checks. Per-entry validation can receive `supportingClaims` from authoritative same-company immutable revisions to resolve generated cross-entry facts without importing foreign active targets. First import supplies the complete validated same-company proposal batch as trusted lookup context. Snapshot validation supplies no external claims: all dependencies must resolve inside its approved current manifest, and preview reports stale/unapproved support as a publication blocker. These optional inputs separate pure schema validation from privileged database lookups; callers must perform the matching SQL validation before persistence. Tenancy is always enforced by protected database functions, never by these pure helpers alone.

`json-schemas.json`, `defaults.json`, and `field-registry.json` support generated SQL parity. The JSON Schema is a structural boundary; refinements such as employee-range honesty, exact decimal ordering, unique stable IDs, claim graphs, compatible origins, coverage cardinality and human conflict resolution are additionally enforced by TypeScript and protected SQL validators. Regenerate schemas from the exported Zod schemas whenever structure changes.

Canonical export JSON sorts object keys by UTF-16 code-unit order, preserves array order, has no insignificant whitespace, and uses `JSON.stringify` primitive escaping/number rendering. It rejects undefined, cycles, non-finite numbers and non-JSON objects. SHA-256 hashes the UTF-8 encoding of those exact bytes. Download names derive from the frozen company name.

Focused verification: `npm run unit -- tests/contracts tests/knowledge` plus `npm run typecheck`. The complete illustrative export is retained in tests from the plan as a realistic compatibility fixture.
