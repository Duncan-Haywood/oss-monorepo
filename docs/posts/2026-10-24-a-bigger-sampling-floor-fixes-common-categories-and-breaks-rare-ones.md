---
title: "A bigger sampling floor fixes common categories and breaks rare ones"
date: 2026-10-24
description: "Hand-coding audits weighted by coder uncertainty cover 96% for a 0.1% emotion at a 0.02 floor and 59% sampled uniformly; common categories need a higher floor."
tags: [research, statistics, llm-coding, qualitative-data]
---

When a language model codes text and a researcher audits a sample by hand to
correct it, the audit can favour items the coder is unsure about. On 38,234
GoEmotions comments, with 200 audited items and nine emotions from 0.10% to
1.96% prevalence, the previous step found that this weighted audit covers about
95% for the rare ones but only 86 to 89% for the commonest two.

The obvious fix was a larger floor on each item's inclusion probability, so
every audit holds some positives. We swept the floor (0.02 to 0.50, the top
being uniform sampling), 500 draws per cell. The prediction, that coverage would
reach 93% everywhere, was refuted:

- Below 0.9% prevalence, the 0.02 floor is the best. Grief: 96.0% coverage at
  0.02, 80.2% at 0.05, 59.4% for uniform sampling. The share of audits with no
  positive item grows from 59% to 85%.
- At 1.05 to 1.96%, floors of 0.05 to 0.10 give 93 to 96% coverage, but the
  interval is then 0.98 to 1.13 times as wide as a plain Wilson interval on a
  uniform audit, so the gain is gone.

The coder here is a weak logistic regression, not an LLM, and one corpus was
used, so this shows a trade-off, not a rule. Next is a real local LLM coder.
Data and code: `research/llm-coding-inference/experiments/pi_floor.py`, with
the log in `LOG.md`.
