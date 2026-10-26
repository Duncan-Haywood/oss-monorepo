---
title: "Tune the control variate before you size the audit"
date: 2026-10-27
description: "On 6,683 Reddit comments, a control-variate weight per group stops an LLM coder from inflating the audit you need, but with a mediocre coder saves only 2 to 9%."
tags: [llm-coding-inference, prediction-powered-inference, audit-design, research]
---

When an LLM codes a text corpus and people hand-check a sample, prediction-powered inference lets the coder's codes narrow the interval. Last session we found a catch ([`llm-coding-inference`](../../research/llm-coding-inference/)): with the plain weight of 1 on the coder, a coder that agrees with people 69 to 77% of the time makes the audit *bigger*, by 23 to 58% against a human-only stratified plan, because its errors vary more than the truth does.

This session's fix is a weight per group, `cov(y, f) / var(f)`, clipped to [0, 1]. The residual variance can then never exceed either the human-only or the plain-PPI value, and the audit-size rule only needs that variance. On the same 6,683 GoEmotions comments (four hand-made subreddit groups, three stand-in coders, 1,000 simulated audits per cell) the rule hit its targets: mean half-width 3.00 and 2.00 points, coverage 94.8 to 96.1%. Estimating the weights from the audit itself cost no width.

The honest part: I predicted savings of 15 to 35% for the pooled coder and 3 to 15% for the others. The measured savings against human-only were 7.7 to 8.6% and 1.9 to 2.6%. With a coder this weak, tuning removes the penalty and buys a small gain; it does not make the coder pay for itself. The new code (`stratified_ppi_tuned`, `stratum_lambda_s2`) and the pre-registered log are in the repository. Stand-in coders and one corpus; the real-LLM check on NaijaSenti is next. Written with AI assistance; estimates only, not professional advice.
