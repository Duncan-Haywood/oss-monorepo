---
title: "Why a decent LLM coder barely shrinks the audit, and the guard that keeps it honest"
seo_title: "Why a decent LLM coder barely shrinks the audit"
date: 2026-11-07
description: "A closed form caps what an LLM coder can save in a hand-coding audit, a fitted control variate captures it, and a three-positive guard keeps rare cases valid."
tags: [research, llm-coding-inference]
---

If an LLM pre-codes your tweets or survey answers, you audit a sample by hand to get a valid interval. Splitting that audit by the LLM's own label looked like it should shrink the interval a lot. On NaijaSenti, with a coder whose informedness (J) is 0.39, it shrank it by 0.6%.

Two results explain it. First, for sensitivity s and specificity c the best possible half-width ratio against pooling is sqrt(s(1-c)) + sqrt((1-s)c), whatever the prevalence: 0.916 at J 0.39, so at most 8%. Second, the pooled audit already fits a control-variate weight; against that path the ratio is 0.995 (1,000 draws), against an uncorrected pooled audit it is 0.915.

At rare categories (1 to 5%) the cell design can win more but undercovers when the coder-negative cell holds few human positives (91.1% at 2%). Requiring at least 3 pilot positives in that cell restored 93.4% or more everywhere tested, including GoEmotions gratitude and amusement (96 to 97%) and fear and sadness at 1 to 2% (94.8 and 95.2%).

Limits: 500 draws per cell (about 2 points of coverage noise), one run each, k = 3 chosen on one corpus, one LLM family. Paper Section 6 and `research/llm-coding-inference/LOG.md` have the numbers. While writing this I found the 7l results file held a 20-draw smoke run; I reran the 1,000 draws and it matches the log.
