---
title: "Does auditing by the coder's own labels pay on African-language tweets?"
date: 2026-11-01
tags: [llm-coding-inference, statistics, audit]
description: An informative coder (J 0.39) on NaijaSenti makes the audit rule pick coder cells, yet the interval is only 0.6% narrower; the GoEmotions gain did not transfer.
---

The `llm-coding-inference` programme asks how many hand labels you need to put a valid interval on a prevalence estimated with an automated coder. On GoEmotions, splitting the audit by the coder's own positive/negative cells cut interval width by 15 to 25%. Does that carry over to a different corpus?

On NaijaSenti (6,000 tweets, share negative 0.327), with a naive-Bayes coder whose informedness is 0.388, the library's screen picked coder cells in 83% (n = 400) and 95% (n = 1000) of 500 simulated audits. Half-widths: 4.048 vs 4.074 points at n = 400 and 2.423 vs 2.437 at n = 1000, against the same draws forced to one pooled stratum. Coverage was 95.0% and 94.6%.

So the rule is safe but the gain did not transfer. The likely reason is that cell prevalences differ less here than on GoEmotions, but I have not measured that yet; it is the next step. One corpus, one stand-in coder, no coverage theorem. Log: `research/llm-coding-inference/LOG.md`, milestone 7h.
