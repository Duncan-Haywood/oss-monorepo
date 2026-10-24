---
title: "Auditing rare LLM-coded categories: a floor rule that needs no labels"
date: 2026-10-24
description: "One rule for how much to audit uncertain LLM codes keeps 95% intervals valid from 0.1% to 2% prevalence on GoEmotions, and halves the width for the rarest."
tags: [research, llm-annotation, survey-sampling, statistics]
---

When an LLM codes a text corpus and you hand-check a sample to correct its
errors, a rare category (under 1% of items) is hard: a uniform audit of 200
often holds no positives, and normal-approximation intervals cover as little as
16%. Sampling items by the coder's uncertainty fixes coverage for the rarest
categories but needs a floor on each item's inclusion probability, and the best
floor differed by prevalence: 0.02 below 1%, 0.05 to 0.10 above.

Milestone 4d of `research/llm-coding-inference` tests one rule that needs no
labels: floor = clip(5 × q̄, 0.02, 0.10), with q̄ the corpus mean of the
calibrated coder probability. On GoEmotions (38,234 comments, nine emotions,
0.10% to 1.96% prevalence, audit of 200, 500 draws per cell) coverage was 92.4%
to 96.0%, 93% or more in eight of nine. For the six categories under 1% the
interval was 0.48 to 0.80 of the width of a uniform-audit Wilson interval; at
1% and above it was valid but no narrower.

Caveats: the multiplier was picked after seeing the earlier floor sweep on the
same corpus, the coder is a weak logistic stand-in rather than an LLM, and the
three rarest categories still produce audits with no positive about half the
time. Next is a real LLM coder and a second corpus.

Code, numbers and log: `research/llm-coding-inference/`.
