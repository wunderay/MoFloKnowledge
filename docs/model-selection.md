# Development-agent model selection

> This document concerns models used by development agents and task dispatch only. It does not describe or authorize AI features in MoFloKnowledge; the product uses no AI.

Owner direction, 2026-10-16: choose models and reasoning effort for price/performance. Use GPT-6 Luna and GPT-6.1 Sol as the default range. This policy governs development-agent dispatches only; it does not start implementation or select product behavior.

Choose the cheapest configuration likely to finish correctly, including expected retries, review, coordination and latency. A small task can still need stronger reasoning when a mistake risks tenant isolation, security or data integrity. Start at the appropriate level for known difficulty; do not spend calls proving that every lower level fails.

| Model and effort | Initial use |
| --- | --- |
| GPT-6 Luna, low | Bounded lookup, inventory, log extraction, mechanical documentation and result reporting. |
| GPT-6 Luna, medium | Routine acceptance tests, fixtures, simple forms and small edits following an established pattern. |
| GPT-6 Luna, high | Bounded implementation or diagnosis that needs more reasoning while keeping a narrow contract. |
| GPT-6.1 Sol, low | Straightforward implementation with more instruction or integration demands than the Luna task class. |
| GPT-6.1 Sol, medium | Default substantive implementation, cross-module work and ordinary independent code review. |
| GPT-6.1 Sol, high | Ambiguous specifications, full-plan Quest design, authorization/RLS/SSRF, transactional or concurrent behavior, and independent review of those boundaries. |
| GPT-6.1 Sol, xhigh or max | Difficult unresolved reasoning after high effort, or a concrete case where anticipated failure cost justifies starting higher. Never the blanket default. |

Role defaults are conditional: Petitioner uses Luna/medium for finite routine criteria and Sol/medium or high for difficult contracts. Builder uses Luna/medium or high for bounded pattern-based work and Sol/medium for substantive work. Receptionist uses Sol/medium normally and Sol/high for security or integrity boundaries; Luna/high can review purely mechanical changes. Researcher starts at Luna/low or medium. Diagnostician starts at Luna/medium for bounded symptoms, Sol/medium for cross-module failures, and Sol/high for difficult causes. Questwright and an Arbiter resolving substantive correctness disputes use Sol/high. The existing primary agent remains the controller; no extra controller call is needed. External forge review depends on the actual configured service and is not an agent we simulate.

Use separate worker instances for acceptance, implementation and independent review of the same Quest, even when the model is the same. Keep authorized worktrees isolated. Set model and effort explicitly in each dispatch and record why the task warrants that tier. Existing Quest `suggested_model` entries are initial planning estimates; apply this policy to the actual task brief at dispatch and record the chosen configuration. They are not permanent role bindings or measured optimal assignments.

Escalate on evidence: repeated contract misunderstanding, an unresolved cause, or reasoning beyond the task's initial classification. Supply the failing evidence and a compact handoff rather than restarting discovery. Do not blindly retry or exhaust every intermediate effort level. Use the first completed representative tasks to adjust future choices from acceptance results, rework and observed latency. Record exact tokens or billed cost only when trustworthy usage telemetry exists. No calibration run is claimed here. Other model families have no standing assignment; revisit only if evidence warrants it.

## Benchmark reference

Artificial Analysis checked 2026-10-16. Its Intelligence Index task costs include input, cache and reasoning/answer token charges; these are benchmark averages, not this project's costs. General intelligence results are a starting point, not proof of coding success, and dividing index scores by dollars would not establish a reliable return on spending.

| Configuration | Intelligence Index | Benchmark USD/task |
| --- | ---: | ---: |
| [Luna max](https://artificialanalysis.ai/models/gpt-6-luna/) | 38 | 0.07 |
| [Sol medium](https://artificialanalysis.ai/models/gpt-6-1-sol-medium/) | 48 | 0.21 |
| [Sol high](https://artificialanalysis.ai/models/gpt-6-1-sol-high/) | 50 | 0.32 |
| [Sol xhigh](https://artificialanalysis.ai/models/gpt-6-1-sol-xhigh/) | 51 | 0.39 |
| [Sol max](https://artificialanalysis.ai/models/releases/gpt-6-1-sol/) | 52 | 0.72 |

The [Luna family comparison](https://artificialanalysis.ai/models/releases/gpt-6-luna) reports low effort at USD 0.0045 per benchmark task, compared with USD 0.07 at max. This supports choosing effort deliberately. The smaller score gains at the top of Sol's range support reserving those settings for cases that need them. Recheck current prices and relevant coding evidence when the decision materially depends on them; actual project results govern subsequent tuning.
