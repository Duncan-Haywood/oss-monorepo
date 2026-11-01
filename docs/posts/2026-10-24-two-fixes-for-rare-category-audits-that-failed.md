---
title: "Two fixes for confidence intervals on rare LLM-coded categories, and why neither worked"
seo_title: "Two fixes for rare LLM-coded category intervals, and why both failed"
date: 2026-10-24
description: "Two attempts at better confidence intervals for rare LLM-coded categories under a weighted audit, and why neither worked."
tags: [research, llm-coding, statistics, negative-result]
---

When an LLM codes text and a person hand-checks a sample, the audit sample gives a confidence interval for how common a category is. For rare categories (under 2% of comments) that interval often lies. In our GoEmotions test (38,234 comments, audit of 200, 1,000 repeats), the interval for an audit that samples by coder uncertainty covered the truth 85.6% of the time for disgust and 89.0% for sadness, against a nominal 95%.

We tried two standard small-count repairs and wrote our prediction down first: a Wilson interval at an effective sample size, and a bootstrap. Neither held.

- **Wilson at an effective size** covered 82% (grief) and 84% (pride) of the time, where the audit holds almost no positives. It did fix sadness (95.4%), at 1.3 to 1.6 times the width.
- **Bootstrap** covered 94% for the rarest two but only 78% to 90% for disgust, fear and sadness.

The plain normal interval stays the best of the three below 1% prevalence. Nothing tried is valid over the whole range. Next: a floor on the sampling probability and an exact interval. The coder here is a weak stand-in, not an LLM, and this is one corpus.

Code, log and results: `research/llm-coding-inference/`.
