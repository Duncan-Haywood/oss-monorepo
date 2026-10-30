---
title: "Stopping a human audit at a 1-point target: valid, and cheaper than the formula says"
seo_title: "Stopping a human audit at a 1-point target"
date: 2026-10-25
description: "A stop-when-narrow audit of AI-coded tweets keeps 93 to 96% coverage at a 1-point target, but stops 11 to 13% below the textbook audit size."
tags: [research, llm-coding-inference, statistics]
---

The [previous test](2026-10-25-audit-size-from-a-pilot.md) found that auditing
in rounds until the estimated interval is 3 points wide hits the target every
time at about the planned size. Another run tested the same 1-point target in parallel; this one compares against the closed-form size that already allows for the finite corpus. The target was 1 point, which means
about 7,000 to 8,000 hand-coded tweets out of 44,485 (NaijaSenti, four languages,
three stand-in coders, 300 simulated audits per cell).

Every audit met the target and coverage stayed at 93.0 to 96.0%. The audit size
varied far less in relative terms (about 1% of the mean, against 4 to 5% at
3 points). One prediction failed: the rule stopped at 6,937 to 8,069 tweets,
11 to 13% under the size the closed-form rule gives (7,833 to 9,240), where at
3 points the two agreed within 1%. I have not found out why; the log lists two
untested candidates. Limits: one corpus, no real LLM coder, 300 draws, and no
optional-stopping correction.

Code and table: [llm-coding-inference](../../research/llm-coding-inference/).
