---
title: "A two-line rule for when to stratify a hand-coding audit"
date: 2026-10-30
tags: [llm-coding-inference, audit-design, research]
description: "Pilot 30% of the audit, then use the coder's own labels as strata only if it looks informative and the pilot holds 20 positives. The rule is now library code."
---

You ask a language model to code 40,000 comments and want a valid interval for a category's share. A hand-coded audit corrects the model. The question is how to spend the audit: one random pool, or split by the model's own label and sample the uncertain side harder.

Over a dozen milestones of the [llm-coding-inference programme](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/llm-coding-inference) the answer came down to two conditions, checked on a 30% pilot of the audit:

1. The pilot's Youden J (sensitivity + specificity - 1) is at least 0.3.
2. The pilot holds at least 20 human-coded positives.

If both hold, split by the coder's label with each side getting at least 35% of the budget. Otherwise stay pooled.

**What it bought.** On GoEmotions admiration (8% prevalence, zero-shot Qwen2.5-1.5B, n = 1,000) the split interval is 15% narrower than pooled, and the screen keeps 85% of that with 94.6% coverage. On rare categories (fear, sadness) the plain screen under-covered at 75 to 87%. The 20-positive guard makes it pool there, and coverage returns to 93 to 96%. On NaijaSenti, where three small coders are close to empty, it pooled and matched pooled width where always-splitting was 22% wider. Any cutoff from 0.2 to 0.5 gave widths within 1%.

**What it does not buy.** There is no coverage theorem for a data-dependent choice, the "informative coder" half rests on one coder and category, and a second corpus needs model weights the sandbox could not fetch.

The rule is now `llmci.audit_design` (`informedness`, `screen`, `cell_allocation`, stdlib only, 3 tests), checked equal to the experiment code on 2,000 random inputs.
