---
title: "Small audits break tuned prediction-powered regression, and cross-fitting does not fix it"
date: 2026-10-25
description: "At 60 to 200 hand-coded tweets, tuned PPI++ loses up to 2.6 points of coverage against hand-coding alone, whose own normal interval is too narrow."
tags: [llm-coding-inference, ppi, measurement]
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks
how to estimate regression coefficients from machine-coded text plus a small
human audit. Last milestone said cross-fitting the weight buys nothing at an
audit of 400. That test was underpowered, so this one reran it on the same
audits at 60, 100 and 200 tweets, 3,000 draws each.

What it found (NaijaSenti, three stand-in coders, no LLM yet):

- Hand-coding alone, with a normal interval, covers 91.6, 92.9 and 94.0% on
  average at 60, 100 and 200. The interval is the problem before any coder is.
- Tuned PPI++ loses a further 0.7, 0.5 and 0.35 points on average, up to 2.6 in
  one cell. For the weakest-signal coder 1 to 1.4 points persist at 200.
- Two-fold cross-fitting does not recover them.
- At 60, 1% of audits miss a whole language and the regression cannot be fit.

So the earlier null at 400 was a power failure, and below 400 a small-sample
interval correction comes first. Table and script are in the
[experiment folder](../../research/llm-coding-inference/experiments/h6k_small_audit.txt).
