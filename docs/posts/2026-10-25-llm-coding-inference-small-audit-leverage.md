---
title: "Small hand-coding audits under-cover because of leverage, not the normal quantile"
date: 2026-10-25
description: "On 6,000+ NaijaSenti tweets, a 60-tweet audit's 95% interval covered 91% of the time. A t quantile added 0.6 points; an HC3 leverage correction added 2.3."
tags: [llm-coding-inference, statistics, qualitative-research]
---

[llm-coding-inference](../../research/llm-coding-inference/) asks how much hand-coding an LLM coder can replace when you need a valid interval. The last milestone found that even human-only regression on a small audit under-covers: 91.6% at 60 tweets, 94.0% at 200.

We tested the obvious fix first. Swapping the 1.96 normal quantile for a t quantile on n - 5 df (2.004 at n = 60) lifted human-only coverage by only 0.6 points (91.1% to 91.7%). A leverage-corrected (HC3) sandwich with the t quantile reached 94.0% at n = 60 and 94.4 to 94.9% at n >= 100. The tuned and cross-fitted prediction-powered estimators, which have no such correction here, stayed at 90 to 91% at n = 60.

So the answer to "is the LLM worth it at 60 audited items?" is not yet known: the comparison is unfair to the PPI++ interval. Next step is giving it the same leverage correction. One corpus, stand-in coders (no LLM reachable), 1,500 draws per cell. Script and tables: `research/llm-coding-inference/experiments/h6l_small_sample_interval.py` and the LOG.
