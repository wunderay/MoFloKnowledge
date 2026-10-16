# No-AI product scope

MoFloKnowledge extracts company facts with deterministic rules over captured website evidence. The product makes no AI/model calls, does not generate text or facts, and does not require a model SDK, provider account, API key, or model-specific environment setting. Development tools may use models during implementation; that is separate from the shipped product.

## Deterministic evidence extraction

The extractor maps explicit, supported website evidence to registered fields. Current supported sources are:

- JSON-LD `Organization` and `LocalBusiness` properties: `description` to company overview, `alternateName` to alternate name, `address` to address, and `areaServed` to service locations.
- JSON-LD `Person`: `name`, `jobTitle`, and `description`, associated with the company only when the captured page provides an organization relationship or a matching person-page heading. On a named profile page under `/team/`, `/people/`, `/staff/`, `/about-us/`, or `/about/`, a matching visible name heading and a title heading such as `Founder` or `CEO` can support that exact name and title. Gender is never inferred.
- JSON-LD `Service` and `Product`: `name`, `description`, `category`, and explicit offer `price` with its stated currency. Service, product, or offerings links can identify the linked item by its visible name and URL; captured detail metadata may support its description or category.
- Explicit visible labels: `Industry:`, `Business model:`, `Company pitch:`, `Target buyers:`, `Service locations:`, `Employee count:`, and `Founded:`, `Established:`, or `Since` followed by a year. The company's own employee count is extracted only from an explicit company-headcount label or equivalent declaration: exact integers and explicit numeric ranges are parsed; approximate wording is retained as evidence without an exact/minimum/maximum value. Arbitrary team/staff prose or a buyer-size statement does not establish the company's headcount. A buyer numeric range may be retained as an audience attribute when the same source context explicitly describes customer businesses (for example “small businesses with 1 to 10 employees”); it must never populate the company employee-count field. A year is used only when stated; it is not inferred from copyright dates or other clues.
- Deterministic design and online-presence observations already supported by the worker, including observed colors, font declarations/computed families, qualifying logo candidates, and company-linked social profile URLs. These observations retain their technical evidence and are not promoted to human-confirmed brand meaning.

Other captured page content remains source evidence when no registered field can safely represent it. FAQ answers and contact details such as email addresses have no current field mapping and must not be presented as extracted business fields. The extractor must not guess a field from nearby wording, infer missing facts, or synthesize copy.

### Controlled field normalization

A registered categorical value may normalize an explicit relation into a concise field label only when the same source sentence names the company as subject and states the current relation. For example, “we provide ... services” or “we offer ... services” can support the controlled value `Service provider`; retain the exact source sentence, source URL, and a note identifying the mapping. Do not infer a role from an offering link, a generic industry statement, a third-party reference, or a comparison such as “many companies offer this service.” Tests must cover both the explicit company statement and a negative comparison. This narrow mapping is not permission to paraphrase or synthesize narrative text.

Audience-size facts belong to buyer/audience fields when the source describes customers. A statement such as “small businesses with 1 to 10 employees” does not populate the company's own employee count. Buyer stage, business type, individual service scope, company headcount, and persona identity remain separate concepts with their own evidence.

### Source-backed descriptions

No-AI extraction may assemble a description from verbatim, source-backed passages when a single overview field would otherwise lose useful website content. Each sentence or bullet must be copied from a captured page, retain a citation to that exact source passage, and remain visibly distinguishable from a human-written summary. Deterministic rules may select and order passages by page role, headings, and explicit company/service relationships; they may remove duplicate navigation text and normalize whitespace. They must not add connective claims, rewrite prose, infer benefits, or turn a collection of nearby keywords into a sentence. When no safe passage exists, the description remains unknown for review.

An offering description may be assembled the same way from its own detail page. A parent service page can support an explicitly listed subservice, but the extractor must preserve the source's actual name and scope. For example, a page that says “Gift & Estate Tax Return Preparation” does not support the additional word “Trust.” A service category link may establish that a named page is a service; it does not establish all the features listed in a human-authored baseline.

Evidence context matters. A founder's statement that they have run “my own accounting practice” since a year supports the founder's practice history, not `year_founded`; that field requires an explicit statement that the company or business was founded or established in that year. An unrelated copyright date is not founding evidence. Company employee ranges require an explicit statement about the company's own staff; customer size ranges require explicit buyer context and remain audience attributes. Founder biography can support named experience and credentials stated on that page. Gender is never inferred from a name, pronouns, or imagery; it requires an explicit self-description. A third-party technology, tracking script, or footer credit does not establish a supplier relationship. A logo candidate is retained as an observed image with its page and URL; a low-resolution third-party directory image is not confirmed as the website's logo. Visual style and tone are not inferred from a flat or incomplete screenshot.

The acceptance requirements and complete baseline traceability matrix are maintained in [readable profile quality](readable-profile-quality.md). The original 45-item extraction case in [extraction quality](extraction-quality.md) is a historical diagnostic only; the captured customer prose is never copied into runtime defaults, templates, or generic output.

## Unknowns and human review

Every registered field remains visible to review. Evidence-backed matches can be proposed; conflicts remain conflicts. `found` means a supported candidate passed evidence validation. `not_found` is appropriate only when a supported extraction check completed without finding evidence. Unsupported fields are `not_checked` and require manual entry or review; incomplete capture or parsing is `partial`. Missing evidence stays unknown rather than being guessed. A user can enter a correction, attach the appropriate source evidence, or leave a field unresolved. The interface and exported review state must not imply that every field was found automatically.

Source-only re-scrapes preserve existing human drafts and approvals. New captures create source-backed review proposals and do not silently overwrite current values. Legacy pending AI-generated proposals remain readable and can be dismissed, but cannot be applied; obtaining new content requires a source-only recrawl. Historical revisions and saved snapshots remain preserved. Publishing remains an explicit human review action that creates an immutable snapshot.

## Boundaries and compatibility

Browser rendering is a capture mechanism for JavaScript-dependent page content and observed styles; it does not call or imply AI. Renderer isolation, outbound proxy enforcement, and host network confinement remain separate deployment properties that require their own qualification evidence. A successful render or local fixture does not prove those properties.

Historical records may contain generated-origin values from the previous product design. Keep those records readable, validatable, and displayable with their existing provenance. Current extraction must not create generated-origin claims or replay cached model output as current extraction. No content-generation feature is part of this scope.
