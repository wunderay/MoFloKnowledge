# No-AI product scope

MoFloKnowledge extracts company facts with deterministic rules over captured website evidence. The product makes no AI/model calls, does not generate text or facts, and does not require a model SDK, provider account, API key, or model-specific environment setting. Development tools may use models during implementation; that is separate from the shipped product.

## Deterministic evidence extraction

The extractor maps explicit, supported website evidence to registered fields. Current supported sources are:

- JSON-LD `Organization` and `LocalBusiness` properties: `description` to company overview, `alternateName` to alternate name, `address` to address, and `areaServed` to service locations.
- JSON-LD `Person`: `name`, `jobTitle`, and `description`, associated with the company only when the captured page provides an organization relationship or a matching person-page heading.
- JSON-LD `Service` and `Product`: `name`, `description`, `category`, and explicit offer `price` with its stated currency.
- Explicit visible labels: `Industry:`, `Business model:`, `Company pitch:`, `Target buyers:`, `Service locations:`, and `Founded:`, `Established:`, or `Since` followed by a year. A year is used only when stated; it is not inferred from copyright dates or other clues.
- Deterministic design and online-presence observations already supported by the worker, including observed colors, font declarations/computed families, qualifying logo candidates, and company-linked social profile URLs. These observations retain their technical evidence and are not promoted to human-confirmed brand meaning.

The parser may add narrowly specified deterministic patterns when they preserve this evidence standard. FAQ/contact text and other captured page content stay available as source evidence when no registered field can safely represent them. The extractor must not guess a field from nearby wording, infer missing facts, or synthesize copy.

## Unknowns and human review

Every registered field remains visible to review. Evidence-backed matches can be proposed; conflicts remain conflicts. `found` means a supported candidate passed evidence validation. `not_found` is appropriate only when a supported extraction check completed without finding evidence. Unsupported fields are `not_checked` and require manual entry or review; incomplete capture or parsing is `partial`. Missing evidence stays unknown rather than being guessed. A user can enter a correction, attach the appropriate source evidence, or leave a field unresolved. The interface and exported review state must not imply that every field was found automatically.

Re-scrapes preserve existing human drafts and approvals. New captures create review proposals and do not silently overwrite current values. Publishing remains an explicit human review action that creates an immutable snapshot.

## Boundaries and compatibility

Browser rendering is a capture mechanism for JavaScript-dependent page content and observed styles; it does not call or imply AI. Renderer isolation, outbound proxy enforcement, and host network confinement remain separate deployment properties that require their own qualification evidence. A successful render or local fixture does not prove those properties.

Historical records may contain generated-origin values from the previous product design. Keep those records readable, validatable, and displayable with their existing provenance. Current extraction must not create generated-origin claims or replay cached model output as current extraction. No content-generation feature is part of this scope.
