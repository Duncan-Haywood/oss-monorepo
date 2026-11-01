---
title: "How much can a coder's labels narrow an audit? A prevalence-free ceiling"
seo_title: "How much can a coder's labels narrow an audit?"
date: 2026-11-01
tags: [llm-coding-inference, statistics, audit-design]
description: Auditing LLM-coded text by the coder's own labels can narrow the interval by at most sqrt(s(1-c))+sqrt((1-s)c), whatever the category's prevalence.
---

We audit a sample of LLM-coded text by hand to get a valid interval on a category's share. Splitting the audit into the coder's positive and negative cells and allocating optimally can narrow the interval. How much?

With coder sensitivity s and specificity c, the Neyman half-width over the pooled half-width works out to sqrt(s(1-c)) + sqrt((1-s)c). Prevalence cancels. A coder with Youden J near 0.4 can give at most about 8% narrower intervals, at 0.5% prevalence or at 50%; J 0.8 gives up to 40%.

Our last experiment (NaijaSenti, an in-language coder, J 0.39) saw 0.6% narrower, against a ceiling of 8.4%, so the pilot and allocation cost ate nearly all of it. I had guessed the earlier GoEmotions gains came from low prevalence; the identity says no, those coders were simply better.

Limits: asymptotic, no pilot cost or finite-population correction, sensitivity and specificity taken as known. Code and numbers: `research/llm-coding-inference/experiments/h7i_cell_contrast.py`.
