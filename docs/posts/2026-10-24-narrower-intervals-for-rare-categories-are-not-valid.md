---
title: "When an LLM-coded interval is narrower for a rare category, check that it is still valid"
seo_title: "A narrower LLM-coded interval for a rare category may not be valid"
date: 2026-10-24
description: "On 38,234 real comments, standard prediction-powered intervals cover as little as 10% at 0.1% prevalence. What an uncertainty-weighted audit does instead."
tags: [research, llm, statistics, qualitative-coding]
---

# When an LLM-coded interval is narrower for a rare category, check that it is still valid

The question: you let a model code a corpus of comments, hand-code a small audit, and want a 95% interval for how common a category is. The proposal in `research/llm-coding-inference` guessed that a coder-label-stratified audit would shrink the interval by a quarter or more for rare categories. We tested that on GoEmotions (38,234 Reddit comments, nine emotions from 0.10% to 1.96% prevalence, truth is a rater majority, audit of 200, 1,000 audit draws per cell). The coder is a weak logistic regression stand-in, not an LLM.

## What happened

- The guess was wrong, and the reason is validity, not width. With 200 audited items, the usual normal-approximation interval covers only 16% of the time at 0.10% prevalence (grief) and 61% at 0.42%. PPI++ and the stratified audit are no better (10 to 81%). A "narrower" interval there is narrower because it is wrong more often.
- A Wilson interval on a uniform audit is the valid baseline: 91 to 99% coverage in every category.
- An audit that samples items with probability proportional to the coder's uncertainty, with inverse-probability weights, covered 93 to 96% for seven of nine categories and was 22 to 52% narrower than Wilson for six of them (grief, pride, relief, embarrassment, nervousness, remorse). It covered only 86% (disgust) and 89% (sadness), probably the same normal-approximation failure moving to the next prevalence band. We have not yet shown that.
- Label-stratified PPI turns out to equal post-stratified hand-coding exactly, because the coder's codes are constant inside each stratum. The coder only chooses the strata.

## Limits

One corpus, one weak coder, one uncertainty rule, and the planned hypotheses H2 and H4 are refuted as stated. A real LLM coder (milestone 5) may change which design wins. Numbers: `research/llm-coding-inference/experiments/rare_audit.txt`; plan and outcome are in the programme's `LOG.md`. Written with AI assistance (Claude Code).
