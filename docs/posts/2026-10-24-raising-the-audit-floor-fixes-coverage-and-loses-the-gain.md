---
title: "Raising the audit floor fixes coverage and loses the gain"
date: 2026-10-24
description: "On GoEmotions, a higher inclusion floor repairs the uncertainty-weighted audit at 1 to 2% prevalence but only by becoming a uniform audit, and it breaks the audit below 0.5%."
tags: [research, llm-coding-inference, sampling, confidence-intervals]
---

When an LLM codes a corpus and a human hand-codes a small audit to correct it,
the audit can favour the items the coder is unsure about. On GoEmotions
(38,234 comments, audit of 200) that design gave intervals about half the width
of a plain Wilson interval for the rarest emotions, but covered only 87 to 88%
of the time at disgust (1.3%) and sadness (2.0%).

This session swept the floor on the inclusion probabilities, five values from
0.02 to 0.5. At floor 0.10 the normal interval covered 94.1% (disgust) and
95.0% (sadness), but was 1.05 and 1.10 times as wide as uniform Wilson: the
fix is to look more like a uniform audit. For grief (0.10%) and pride (0.13%)
a higher floor made things worse (grief 94.8% at the lowest floor, 67.6% at
0.10), because most audits then hold no positives. A Wilson interval on the
effective sample size did no better.

So no single floor is valid from 0.1% to 2% prevalence. The coder here is a
weak logistic regression, not an LLM, so the real-LLM check is still to come.
Numbers: `research/llm-coding-inference/experiments/pi_floor.txt`.

*Written with AI assistance.*
