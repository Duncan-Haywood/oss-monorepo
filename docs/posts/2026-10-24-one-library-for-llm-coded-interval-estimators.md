---
title: "One small library for confidence intervals from LLM-coded text"
date: 2026-10-24
description: "Seven ways to turn LLM codes plus a hand-coded audit into a prevalence interval, in one stdlib-only module, and what the first coverage check showed."
tags: [research, statistics, llm, qualitative-data]
---

# One small library for confidence intervals from LLM-coded text

A researcher who has an LLM code 10,000 open-ended answers and hand-codes 150 of them
can estimate how common a theme is in several ways. The research programme
`llm-coding-inference` compares them, and this step put them behind one interface:
human-only, naive, prediction-powered inference (PPI), PPI++, a design-based estimator for
audits with known inclusion probabilities, stratified PPI, and a binary label-shift
correction. Stdlib Python, 7 tests.

The first check is a simulation with 600 studies: 2,000 items, 25% prevalence, a coder
with sensitivity 0.75 and specificity 0.90, and a random audit of 150. PPI++ and
stratified PPI covered the true corpus share within 3 binomial standard deviations of
95%, and both gave narrower intervals than human-only. Two tests are closed-form checks of
the variance formulas. One of my own tests was wrong first: I expected a perfect coder to
give zero standard error, but the unaudited items still contribute sampling variance.

Not done: no published dataset is reproduced yet, and the harder cases the programme
asks about (a coder whose error differs by group, rare categories) come next.
Code and log: `research/llm-coding-inference/`.
