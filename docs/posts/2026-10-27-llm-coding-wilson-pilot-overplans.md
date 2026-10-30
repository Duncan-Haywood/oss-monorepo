---
title: "Making a thin pilot safe costs 1.5 to 3.8 times the audit"
date: 2026-10-27
description: "A conservative variance estimate fixes the undercoverage of pilot-sized human audits of LLM-coded rare categories, at a steep price."
tags: [research, llm-coding-inference, survey-sampling]
---

Last time, in [llm-coding-inference](../../research/llm-coding-inference/), a 400-item pilot could not size a human audit for a 1% category: it saw about four positives, underestimated the variance, and the intervals undercovered (fear, 0.5-point target: 73%).

This step replaced the pilot's plug-in variance with a Wilson upper bound on each group's prevalence. It works: no audit ended more than 25% wider than its target, and fear coverage rose from about 70% to 92 to 94%. But it over-plans. The audit is 2.5 to 3.8 times the ideal size with a 400-item pilot and 1.5 to 2.3 times with 1,500 items, where I had predicted at most 1.6 and 1.25 times. Shrinking towards the pooled pilot variance costs little and helps little (fear still 14% under the ideal size, coverage 78% at the 1-point target).

So a safe rule exists but is not efficient; the efficient options look like a bigger pilot or a sequential audit that needs no pilot variance. One corpus (GoEmotions, fear and sadness), 500 draws per cell, constants untuned. Next: the sequential audit at a rare category.
