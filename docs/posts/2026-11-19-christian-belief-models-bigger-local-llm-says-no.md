---
title: "A bigger local language model knows religious groups differ, then answers No to everything"
date: 2026-11-19
description: "Qwen2.5-3B on a CPU ranks GSS group gaps better than 1.5B (Spearman 0.56) but saturates to No, so its gap on the probability scale shrinks to 2% of the truth."
seo_title: "Does a 3B local LLM know survey group gaps? GSS test"
tags: [research, christian-belief-models, survey-imputation, llm, GSS]
---

Yesterday's post on the [christian-belief-models](/research/christian-belief-models/) programme found that a small open-weights language model, given only a General Social Survey respondent's background, knows *which way* religious groups differ but predicts about a tenth of the gap. Qwen2.5-1.5B-Instruct's predicted gap between a source and a target group had a slope of 0.09 on the true gap. The 0.5B model's gaps ran the wrong way. The obvious question is whether that tenth grows with model size. If it grows quickly, the paper's advice to keep a small calibration subsample in every group has an expiry date.

This run added the next size in the same family, Qwen2.5-3B-Instruct, on the same four CPU cores, the same 3,478 sampled respondents, the same prompts and the same 74 group-by-item cells. The predictions went into the log before anything was scored. Scoring took 109 minutes.

**It ranks group gaps better.** The rank correlation between its predicted gap and the true gap rose from 0.35 to 0.56.

**But it answers No to almost everything.** 87% of its 40,249 probabilities are below 0.01 or above 0.99, and nearly all of those are below. On same-sex relations, adultery and abortion its median probability of "Yes" rounds to zero. It misses every group's share on the low side, by a median 61 points, twice the 1.5B model's miss.

**So the pre-registered measure went the wrong way.** On the probability scale, its predicted gap has a slope of 0.02 (bootstrap 0.01 to 0.04). I predicted 0.10 to 0.35, so that part of the prediction failed. Group averages pinned near zero cannot differ by much, however well the model orders the groups. Adding its gap to the source group's share leaves the share almost unchanged and still misses by 12.3 points, against 5.1 for a boosted model fitted on the source group.

**On the logit scale, part of the gap comes back.** This analysis came after the pre-registered one, so weigh it accordingly. Measured in log-odds, the 3B model's gap has a slope of 1.30 (0.75 to 1.86) and a rank correlation of 0.60. Almost all of that comes from the tradition pairs, such as Catholics against Evangelicals. For immigrant generations, Hispanic Catholics and the 2016–24 period it carries little or nothing. Turned into an estimate, it is no better than carrying over the source group's share, and 6.4 points behind the transferred model. It helps on certainty about God and premarital sex. It hurts badly on weekly attendance and daily prayer.

**What this means for a survey designer.** Across three local model sizes, none stands in for asking each group the question. The 3B model has learned roughly how much the traditions differ in log-odds. It has not learned how generations or periods differ, and its probabilities are too extreme to use directly. The paper's recommendation holds: keep a small calibration subsample in each group.

Limits: this is one model family on a CPU, with no prompt tuning. The float32 cross-check was killed for lack of memory, so the 3B's smallest probabilities are unverified. They are also stored to six decimals, which is coarse in the tails the logit analysis uses. The next test is a 7B or larger model with scores stored as log-odds. It asks two things: does the near-1 logit slope on traditions hold, and does any slope appear for generations and periods?

Numbers: [`scale_summary.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/christian-belief-models/experiments/m5_local_llm/results/scale_summary.md); predictions and outcome: the programme's `LOG.md`, 2026-11-19.
