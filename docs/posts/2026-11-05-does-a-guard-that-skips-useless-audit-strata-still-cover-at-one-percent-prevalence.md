---
title: "Does a guard that skips useless audit strata still cover at 1% prevalence?"
seo_title: "Auditing LLM-coded text for rare categories: coverage at 1-2%"
date: 2026-11-05
tags: [research, llm-coding-inference, prediction-powered-inference, qualitative-coding]
description: "On GoEmotions fear (1.2%) and sadness (2.2%), a pool-unless-3-positives guard covers 94.8 to 95.2% with 8 to 9% narrower intervals."
---

When an LLM codes a text corpus and humans audit a sample, you can split the audit by the coder's label (coder-positive and coder-negative cells) to get narrower intervals. At low prevalence that can backfire: the coder-negative cell holds few true positives, and the interval undercovers. The `llm-coding-inference` programme's guard is simple: use cells only if the pilot found at least 3 human-coded positives among coder-negative items, otherwise pool.

Earlier steps showed the guard holds on NaijaSenti and on GoEmotions at 4 to 5% prevalence. This step (milestone 7v) tested 1 to 2%, with a real word-presence logistic coder, n = 1000 audited items from a 6,000-item corpus, 500 draws per cell (coverage uncertainty about 1.9 points).

| category | prevalence | coder J | pooled coverage / half-width | guard (k = 3) coverage / half-width |
|---|---|---|---|---|
| fear | 1.22% | 0.34 | 95.2% / 0.609 pts | 94.8% / 0.562 pts |
| sadness | 2.22% | 0.41 | 92.4% / 0.802 pts | 95.2% / 0.726 pts |

The guard covers in both and is 7.7% and 9.5% narrower than pooled. The gain is smaller than at 4 to 5% (10 to 21%) because these coders are weak. Pooled on sadness sits 0.6 points under 93%, within noise. This is one corpus, one non-LLM coder, one run each; the threshold k = 3 was chosen on a different corpus. Next: put the guard through the library's full screen and test a 0.3 to 0.5% category.

Code and outputs: `research/llm-coding-inference/experiments/h7t_goemotions.py`, `h7t_fear.txt`, `h7t_sadness.txt`; log entry 7v.
