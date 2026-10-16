# Deterministic extraction checks

This document replaces the former model-qualification instructions. The current product has no AI/model extraction path, no provider integration, and no model key configuration. Do not run or expect a live model request.

Use the repository's deterministic extraction tests and the controlled website fixture to check supported evidence extraction, validation, coverage labels, unknown fields, and review proposals. These checks establish only the behavior exercised by those tests; they do not qualify a deployment host, renderer isolation, network confinement, or production service configuration.

The supported fields and their deterministic evidence sources are maintained in [the no-AI product scope](no-ai-redesign.md). A field is considered found only when its required evidence is present and validated. Unsupported fields are `not_checked`; a supported field with no qualifying evidence may be `not_found`; missing or conflicting evidence remains unknown or `partial` and is presented for human review. No test result makes every field automatically complete.
