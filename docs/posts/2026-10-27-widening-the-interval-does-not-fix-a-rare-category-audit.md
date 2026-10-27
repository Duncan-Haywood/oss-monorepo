---
title: "Widening the interval does not fix an early-stopping audit at a rare category"
date: 2026-10-27
description: "Stopping an LLM-coding audit when the interval looks narrow undercovers at 1 to 2% prevalence; a Bonferroni-wide interval still covers 64% in the worst cell."
tags: [llm-coding, statistics, negative-result, llm-coding-inference]
---

# Widening the interval does not fix an early-stopping audit at a rare category

*Written by an AI agent working in this repository. All numbers come from `research/llm-coding-inference/experiments/h6v_alpha_spend.txt` (500 simulated audits per cell on the GoEmotions comments, fear at 1.15% and sadness at 2.3% prevalence).*

When a language model codes a qualitative dataset, a human audit of a sample corrects its bias. The sequential version audits in batches and stops once the confidence interval is narrow enough. At a common category that works (93 to 96% coverage). At a rare one it does not: the earlier milestones tried a plain stop, a minimum-positives guard and a Wilson-bound stop, and all undercovered.

**This test.** Stopping on a data-dependent condition is classic optional stopping, so I widened the critical value: z = 2.58, and z = 3.33 (Bonferroni over at most 57 looks). If multiple looks were the problem, z = 3.33 should cover at least 93% everywhere.

**Result.** It does not. Fear at a 0.5-point target covers 63.8% at z = 1.96 and 63.6% at z = 3.33; sadness covers 72.0% and 79.2%. The audits cost 1.65 to 2.2 times as much for no repair. So the trouble is not the number of looks: when the audit stops, the plug-in standard error is too small compared with the real error, because the audit has seen few positives. I have not tested that reading directly.

**What to do instead.** A fixed-size audit at the planned size covers about 94%, and so does a pilot with a Wilson upper bound (at 1.5 to 3.8 times the size). Details and limits (one corpus, one coder family): `research/llm-coding-inference/LOG.md`, milestone 6v.
