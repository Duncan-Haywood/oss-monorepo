---
title: "Stratifying an LLM-coding audit by coder label gains almost nothing, and pilot size is not why"
seo_title: "Why stratifying an LLM-coded audit by coder label barely helps"
date: 2026-11-02
tags: [research, llm-coding, prediction-powered-inference, negative-result]
description: "On 6,000 NaijaSenti tweets, splitting the hand-coding audit by the coder's own label narrows intervals by 0.5%, at every pilot size tested."
---

The `llm-coding-inference` programme asks how much hand-coding an LLM coder can replace. An earlier step derived a closed-form ceiling: for a coder with sensitivity 0.6 and specificity 0.8 (informedness 0.39), auditing the coder-positive and coder-negative items separately could narrow the interval by at most 8.4%. A real audit on NaijaSenti realised 0.6%.

The obvious explanation was the cost of the pilot that estimates the allocation. Milestone 7k tested it: 1,000 draws per cell, n = 1000, pilot share 0.1 to 0.5, same draws for cells and a single pooled stratum. The interval is 0.994 to 0.997 of the pooled width at every pilot share, so 3 to 7% of the ceiling is realised and pilot size changes that by 0.04 at most. Coverage stays at 93.5 to 96.1%.

So the pilot is not the cause. A candidate, not yet tested: the pooled estimator already uses the optimal control-variate weight, while the ceiling compares against a fixed weight of 1. The ceiling in `plan_audit` should not be read as a forecast of the gain; here it overstates it 14 to 30 times.

Log and script: `research/llm-coding-inference/LOG.md`, milestone 7k.
