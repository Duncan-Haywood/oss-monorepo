---
title: "When an AI coder makes you hand-check more, not less"
date: 2026-10-24
description: "A closed-form audit-size rule for AI-coded text data, checked on 44,485 real tweets. Weak coders needed up to 25% more human coding than none."
tags: [research, llm-coding-inference, prediction-powered-inference, measurement]
---

When an AI codes a large pile of text and humans check a sample, how big must
that sample be? [llm-coding-inference](../../research/llm-coding-inference/)
now has a formula. The half-width of the stratified prediction-powered
interval depends on each group's prevalence, the coder's sensitivity and
specificity there, and how the audit is split. On 44,485 NaijaSenti tweets in
four languages, the simulated width matched the formula to within 0.4% in all
nine design-by-coder cells.

The useful part is what the formula says about size. For a 3-point half-width
with Neyman allocation, the three stand-in coders (a lexicon and two naive
Bayes models, none an LLM) needed 902, 1,083 and 927 hand-coded tweets.
Hand-coding with no coder needed 865. The coders were worse than nothing in
some groups. For example the in-language model had specificity 0.06 on
Nigerian Pidgin, so its errors added variance instead of removing it.

Limits: the sensitivity and specificity are oracle values from the full
corpus, not estimated from a pilot, and the coders are weak stand-ins. A real
LLM coder is the next step. Sizes met the target on average (2.97 points) but
the 95th percentile ran to 3.10.

Code, table and log: `research/llm-coding-inference/experiments/h5_plugin.py`.
