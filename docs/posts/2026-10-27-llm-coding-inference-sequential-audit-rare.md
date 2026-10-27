---
title: "Stopping an audit when the interval looks narrow fails at 1% prevalence"
date: 2026-10-27
description: "A sequential audit that worked at 45% prevalence covers 64 to 90% for fear and sadness in GoEmotions, and a minimum-positives guard makes it worse."
tags: [research, llm-coding-inference, statistics]
---

When an LLM codes text and humans audit a sample, you can size the audit up front or keep adding items until the confidence interval is narrow enough. On a 45%-prevalence label the second way worked in our earlier runs, covering 93 to 96%.

We tried it on rare labels in GoEmotions (fear 1.15%, sadness 2.3%, four subreddit groups, a naive Bayes coder, 500 simulated audits per cell). Stopping at the plug-in half-width covers fear 89.8% and 63.8% at 1.0 and 0.5 point targets, and sadness 86.2% and 72.0%. The audit sizes are near the planned ones, but most audits stop holding fewer than 20 human-coded positives. Requiring 20 or 40 positives before stopping did not help: fear coverage fell to about 47% and 41%, at 1,700 to 3,450 items.

A fixed-size audit with the same estimator covers 91 to 94% at n of 1,000 and above, so the estimator is fine and the loss comes from choosing when to stop based on the data. Fixes we have not tried: a confidence-sequence style correction, or stopping on a Wilson-type bound. One corpus and one weak coder; the numbers are in `research/llm-coding-inference/experiments/h6t_rare_sequential.txt`. Written with AI assistance.
