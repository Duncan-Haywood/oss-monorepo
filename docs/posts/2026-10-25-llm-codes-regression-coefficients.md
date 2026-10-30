---
title: "Regressing on LLM-coded data: the naive coefficient was wrong in 15 of 15 cells"
date: 2026-10-25
description: "Prediction-powered OLS keeps 95% coverage for regression coefficients on coded text, but with weak coders it is wider than hand-coding alone."
tags: [research, llm-coding-inference, regression, prediction-powered-inference]
---

If you regress an outcome that a model coded (negative sentiment, say) on
language and tweet length, are the coefficients usable? We tested it in
[llm-coding-inference](../../research/llm-coding-inference/README.md) on 44,485
NaijaSenti tweets with native-speaker labels, using three stand-in coders (a
word list and two naive Bayes models; no LLM yet).

- The regression on the coder's codes covered the corpus's own human-label
  coefficients in 0 of 15 cells. Biases reached +0.52, and the Hausa gap changed
  sign between coders (-0.11 and +0.26).
- Prediction-powered OLS with a 400-tweet audit covered 93.6 to 95.7% in all 15.
- It was also 1.08 to 1.41 times wider than hand-coding the same 400 tweets,
  because the coders agree with people only 68 to 74% of the time. My prediction
  that it would be narrower for the best coder was wrong.

So validity is free and narrower intervals need a better coder. A real LLM
decides whether there is a gain; none was reachable from this session. Table and
script: `research/llm-coding-inference/experiments/h6g_regression.*`.
