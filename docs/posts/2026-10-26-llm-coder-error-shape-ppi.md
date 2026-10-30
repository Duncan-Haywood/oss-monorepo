---
title: Does the shape of an LLM coder's errors matter for valid inference?
date: 2026-10-26
description: "Four synthetic LLM-coder error shapes at matched accuracy all still narrow PPI++ intervals; the real coders' null result is not explained by them."
tags: [llm-coding-inference, research, ppi]
---

When an LLM codes text and a small human audit corrects it, prediction-powered inference (PPI++) can shrink the confidence interval. An earlier step in the `llm-coding-inference` programme found that real small Qwen coders (0.66 to 0.70 agreement with humans) gave no gain. Was that because their errors are correlated with group, length or label?

We tested four synthetic error shapes at matched overall agreement of 0.80 on a real annotated corpus: independent flips, group-dependent, length-dependent and label-dependent. All four still gave a 10 to 23% narrower interval than human-only (width ratio 0.77 to 0.89), with coverage near 95% for audits of 200 or more. The shapes differ from each other by at most about 0.1. Two of my three predictions about the direction of the differences were wrong (group-dependent error helped rather than hurt), and the log says so.

So the real coders' null result is not explained by these simple correlations; the likelier culprit is error tied to text content, which is the next test. Preliminary: illustrative weights, one corpus, one coder draw per cell. Details: `research/llm-coding-inference/LOG.md`, milestone 5e.
