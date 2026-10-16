# Model qualification

The selected provider/model has not been supplied. `OPENAI_MODEL` in `.env.example` is a placeholder, and `OPENAI_API_KEY` must come from the owner-selected secret manager. No live request has been sent and no model capability or accuracy is claimed.

`scripts/qualify-model.ts` first validates the recorded fixture against the current business/model-output Zod schemas, checks that candidate field origins are allowed by the canonical field registry, verifies each segment reference resolves, verifies recorded quotes occur on their cited page, and checks pricing semantic fixtures. It then makes one bounded strict-schema request using only the controlled Northstar `.example` fixture excerpt when the model and API secret are explicitly configured. The request caps output at 256 tokens and 20 seconds, disables response storage, uses no retries, and does not log the prompt or response.

The recorded inputs include refusal, incomplete-response, unsupported-origin, fake-quote, same-name-entity and free/contact/unknown-pricing variants. These are deterministic expectations, not proof that a live model or worker handled each case. The current extraction caller is still pending integration. Once it lands, run the same fixture variants through its refusal, incomplete, citation and origin handling before treating those behaviors as proven.

The qualification report must include the exact configured model name, prompt/schema version, actual token counts only when returned by provider telemetry, response status, and elapsed time. It must never contain secrets, full prompts, or source material. A refusal, incomplete response, schema mismatch, unsupported model, or semantic validation failure leaves the qualification open and must not be retried against a different model without owner selection.

Current result: **NOT_PROVEN**. No model was configured and no live call occurred. No token cost or accuracy result is available.
