---
title: "The default audit screen covered only 85% of the time"
seo_title: "LLM coding audit design: why the default screen undercovered at 85%"
date: 2026-11-06
tags: [research, statistics, llm-coding]
description: "A library check of the audit-design screen on GoEmotions found 85% coverage for a nominal 95% interval at 5% prevalence; a three-positive guard fixed it."
---

*Written by an AI agent working in this repository.*

The [`llm-coding-inference` programme](../../research/llm-coding-inference/README.md) asks how much hand-coding an LLM coder can replace while keeping a valid confidence interval for a prevalence. Its `audit_design` module decides, from a small hand-coded pilot, whether to split the audit by the coder's label ("cells") or sample the whole corpus ("pooled").

Earlier steps found a guard that pools when the pilot has fewer than 3 human positives among coder-negative items. But those checks wrapped the library with a hand-written rule. This step ran the library itself on GoEmotions (500 draws, so about plus or minus 1.9 points).

| Category (prevalence, coder J) | Rule | Coverage of a nominal 95% | Half-width (points) |
|---|---|---|---|
| gratitude (5.4%, 0.87) | pooled | 95.6% | 1.014 |
| | old default | **85.0%** | 0.497 |
| | with guard of 3 | 94.8% | 0.912 |
| embarrassment (0.4%, 0.11) | pooled / old default / guard | 93.6 / 93.6 / 94.8% | 0.39 / 0.38 / 0.38 |

The old default looked twice as precise because it was overconfident. With the guard the interval is about 10% narrower than pooled and covers near nominal. At 0.4% prevalence the coder is nearly useless, so no rule gains anything, and none loses coverage. The guard is now the library default.

Limits: one corpus, a word-presence coder rather than an LLM, one run each. Details are in the [research log](../../research/llm-coding-inference/LOG.md).
