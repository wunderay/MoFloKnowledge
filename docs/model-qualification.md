# Model qualification

The production worker extraction path is implemented and integrated. `src/worker/main.ts` creates a `ResponsesPageExtractor` when both `OPENAI_API_KEY` and `OPENAI_EXTRACTION_MODEL` are configured. It sends one bounded page at a time with sanitized text segments and technical observations in an untrusted-data envelope, uses a strict Zod-derived candidate schema, validates evidence locally, and records refusals, incomplete output, and invalid candidates as safe partial failures. Without those settings, deterministic observations remain available and model-derived coverage is partial.

The owner has deferred selecting a hosted provider/model and supplying a live secret. No live request has been sent. Runtime model compatibility, strict-output behavior, refusal/incomplete handling on a selected provider, actual extraction quality, provider terms, and data retention remain **NOT_PROVEN**. Do not substitute an example model or send website content to a provider before owner selection.

## Deterministic fixture checks

Run `npm run qualify:model` to check the recorded Northstar fixture against the current business and model-output schemas. The script verifies fixture field origins, segment references, text excerpts, pricing semantics, and that refusal/incomplete cases have expected failure labels. These checks establish fixture consistency and local contract behavior; they do not test a live model or exercise the production worker's full per-page pipeline. Without a model/key, the script still prints these results but exits with status 2 because live qualification is `NOT_PROVEN`.

The optional bounded live request in this script uses `OPENAI_MODEL` plus `OPENAI_API_KEY`, sends only a controlled fictional `.example` excerpt, caps output at 256 tokens and the request at 20 seconds, disables response storage, and makes no retries. It checks the returned structure, allowed origins, and segment references. The production worker currently uses `OPENAI_EXTRACTION_MODEL`, so configure both model-name variables to the same owner-selected identifier when running qualification and the worker. A passing bounded request is still only a narrow compatibility check, not proof of extraction accuracy or production readiness.

The script writes a JSON result to standard output. Record the exact model name, prompt/schema versions, status, elapsed time, and provider-reported token counts when available. Never retain keys, full prompts, or source material in the report. A missing model/key, refusal, incomplete output, schema mismatch, or semantic validation failure leaves qualification open.

## Qualification sequence

1. The owner selects the provider/model and approves its data-processing and retention terms.
2. Run the deterministic checks without a live key and review the fixture expectations.
3. If authorized, run the bounded request with the selected model and record its result.
4. Exercise the production worker on the controlled website fixture with that model, including refusal, incomplete response, citation, origin, conflict, and pricing cases.
5. Keep production extraction gated until the live worker behavior and operational limits are accepted.

No model or provider result is currently recorded. The worker integration exists; hosted model qualification remains deferred.
