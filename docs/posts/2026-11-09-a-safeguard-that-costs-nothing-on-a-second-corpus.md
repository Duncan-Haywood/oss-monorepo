---
title: "Does a safeguard for LLM-coded audits hold on a second corpus?"
seo_title: "Prediction-powered audit guard tested on NaijaSenti"
date: 2026-11-09
tags: [research, llm-coding-inference]
description: "The negative-cell guard for coder-cell audits covers 94.0 and 95.8% on NaijaSenti and is within 1% of the pooled width."
---

The llm-coding-inference programme asks how much hand-coding an LLM coder can
replace while keeping a confidence interval honest. Earlier milestones found
that a single check, "at least 3 human positives among the pilot items the
coder called negative", is enough protection, and that the older screen only
costs width. All of that was on GoEmotions, so the open item was a second corpus.

I ran it on NaijaSenti's negative share (32.7%, 6,000 tweets, an in-language
naive-Bayes coder with Youden J 0.39), 500 draws per cell, n = 400 and 1,000:

| n | pooled | shipped default | guard only |
|---|---|---|---|
| 400 coverage % | 96.6 | 95.0 | 94.0 |
| 1,000 coverage % | 93.2 | 92.6 | 95.8 |

Half-widths are within 1% of pooled everywhere (guard only 0.2 to 0.6% narrower).
The 92.6% cell is under my 93% bar, but pooled gets 93.2% on the same draws and
500 draws give about plus or minus 1.9 points, so I read it as noise and did
not rerun. I wrote the prediction after seeing the output, and the log says so.

What this does not show: the guard exists for rare categories, and 32.7% is not
rare. The next check is a rare category on a second corpus, and a second model
family. Code and numbers: `research/llm-coding-inference/experiments/h7ab_*`.
