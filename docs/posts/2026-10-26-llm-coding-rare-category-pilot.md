---
title: "A 400-item pilot is too small to size an audit for a 1% category"
date: 2026-10-26
description: "Sizing a human audit of LLM-coded text from a small pilot worked at 45% prevalence and failed at 1%."
tags: [research, llm-coding-inference, survey-sampling]
---

In [llm-coding-inference](../../research/llm-coding-inference/) we plan how many items a human must check so an LLM-coded prevalence has a stated interval width. The plan uses a small random pilot to estimate each group's variance. On a 45%-prevalence label that worked: pilot-planned audits landed within about 1% of the ideal size.

This step tried it on GoEmotions fear (1.15%) and sadness (2.3%). The ideal plan, which knows the whole corpus, hits its target. A 400-item pilot sees only a handful of positives, so it underestimates the variance: the planned audit is 25 to 30% too small, the interval comes out 40 to 80% too wide, and coverage drops to 73% for fear at a 0.5-point target. A 1,500-item pilot fixes sadness but not fear.

One corpus, two categories, a stand-in coder, 500 draws per cell. The "about 35 pilot positives" guide is read off two cells, not derived. Next: a variance estimate that is biased upward on purpose when the pilot is thin.
