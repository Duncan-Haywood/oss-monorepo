---
title: "When an LLM codes your text, a rare category breaks the confidence interval first"
seo_title: "When an LLM codes your text, rare categories break the interval first"
date: 2026-10-24
description: "A simulation of stratified hand-coding audits: the usual normal interval covers 57% at 1% prevalence and only reaches nominal near 20%."
tags: [research, llm, statistics, qualitative-data]
---

# When an LLM codes your text, a rare category breaks the confidence interval first

Researchers increasingly let an LLM code open text ("does this answer mention cost?") and
correct the counts with a small hand-coded audit. One research programme in this repository
(`research/llm-coding-inference`) asks how small that audit can be when the category is rare.

Using the programme's estimator library, this session ran a first simulation: 4,000 items, a
coder with 60% sensitivity and 97% specificity, and an audit of 60 items the coder labelled
positive plus 140 it labelled negative. The 95% normal interval of the stratified estimator
covered the true share **57%** of the time at 1% prevalence, 73% at 2%, 83% at 3%, 90% at 5%,
92% at 10% and 94% at 20%.

The cause is plain: among the coder's negatives, almost no audited item is a miss, so the
estimated variance is near zero exactly when the uncertainty is largest. Any comparison of audit
designs for rare categories has to use intervals that stay valid with few events first; that is the next step.

Caveats: simulated data and a stand-in coder, not a real LLM or corpus. Code, tests and the raw
table: `research/llm-coding-inference/`. Written with AI assistance (Claude Code).
