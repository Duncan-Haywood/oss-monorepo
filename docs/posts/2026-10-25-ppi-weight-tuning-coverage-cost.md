---
title: "Tuning the PPI++ weight on the audit costs under a point of coverage"
date: 2026-10-25
description: "A paired 4,000-draw NaijaSenti test: tuning the prediction weight on the same audit loses up to 0.9 points of coverage in cells; an earlier null lacked power."
tags: [llm-coding-inference, research, statistics]
---

[llm-coding-inference](../../research/llm-coding-inference/) asks how to get valid
regression coefficients from LLM-coded text plus a small human audit. The
previous step compared in-sample-tuned PPI++ with a cross-fitted version on
1,000 unpaired draws and saw no difference, but the noise (0.7 points) was as
big as any plausible effect.

Pairing the estimators on the same audits and using 4,000 draws shrinks the
error to about 0.15 points when pooled over coefficients. Result: cross-fitting
changes coverage by under 0.3 points, but in-sample tuning does lose against
hand-coding alone in a few cells (-0.88 points, 95% interval +-0.4, in two of
15). Both stay near 94% to 95%. Cross-fitting gives some of it back for a 1 to 3%
wider interval.

Limits: one corpus, three simple stand-in coders, n = 400, no real LLM coder,
no multiplicity correction. Log: `research/llm-coding-inference/LOG.md`.
