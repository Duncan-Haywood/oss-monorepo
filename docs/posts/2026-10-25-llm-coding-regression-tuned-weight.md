---
title: "Regressing on an LLM's labels: a tuned audit weight stops the interval getting wider"
date: 2026-10-25
description: "Regression on LLM-coded text covered the truth 0 of 15 times; prediction-powered OLS was valid but wide. A per-coefficient weight fixes the width."
tags: [research, llm, statistics, prediction-powered-inference, qualitative-coding]
---

# Regressing on an LLM's labels: a tuned audit weight stops the interval getting wider

If you regress an outcome that a model labelled (here, negative sentiment in
44,485 Nigerian tweets from NaijaSenti, on language dummies and tweet length),
the coefficients are wrong and the standard errors do not know it. In our
earlier step, the naive regression on three stand-in coders' labels covered the
corpus's own human-label coefficients in 0 of 15 cells, with biases up to +0.52
and sign flips between coders. Prediction-powered OLS with a 400-tweet human
audit was valid (93.6 to 95.7% coverage) but 1.08 to 1.41 times *wider* than
just regressing on the 400 hand labels, because these coders agree with the
humans only 68 to 74% of the time.

This step (`research/llm-coding-inference`, milestone 6h) picks the weight on
the coder per coefficient (the PPI++ idea) instead of fixing it at 1.

- Coverage stays at 93.3 to 95.6% in all 15 cells (1,000 audit draws each).
- Standard error is 0.99 to 1.00 times hand-coding for the two weakest coders,
  so the penalty is gone.
- For the 74%-agreement coder it is 0.935 to 0.988 times hand-coding: a 1 to
  7% narrower interval. A small gain, and the honest size of what a mediocre
  coder buys.

One thing went wrong first and is worth saying. The first version of the
estimator kept the whole corpus's design matrix in the estimating equation and
only varied the weight. It was *wider* than hand-coding everywhere, because at
weight 0 it is not hand-coding. The general equation blends the design matrix
too (lam times the corpus matrix plus 1 minus lam times the audit's); only then
is weight 0 exactly ordinary OLS on the audit. A unit test now pins that
endpoint.

Caveats: the coders are stand-ins (a word list and two naive Bayes models), not
an LLM; the truth is the corpus's own OLS; the weight is chosen on the same
audit it is evaluated on, which probably explains the roughly one-point
coverage loss against hand-coding. The log and code are in
[`research/llm-coding-inference/LOG.md`](../../research/llm-coding-inference/LOG.md)
and `experiments/h6h_ppipp_regression.py`. Prepared with AI assistance.
