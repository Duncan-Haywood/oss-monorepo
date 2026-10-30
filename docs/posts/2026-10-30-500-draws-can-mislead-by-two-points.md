---
title: "500 simulation draws can mislead by two points: rechecking an audit's coverage"
seo_title: "Is 500 Monte Carlo draws enough? Rechecking confidence-interval coverage"
date: 2026-10-30
tags: [llm-coding-inference, coverage, evaluation]
description: "An audit interval showed 92.0% coverage in 500 draws and 94.1% in 2,000. A rerun of the same cell shows how far a small simulation can wander."
---

The [llm-coding-inference](https://duncan-haywood.github.io/oss-monorepo/research/llm-coding-inference/) programme builds confidence intervals for how often a category appears in a text corpus when a language model does the coding and humans label a sample. Its audit planner, run through the library, covered the true share in only 92.0% of 500 simulated draws on GoEmotions "admiration" at 1,000 human labels, against 94.6% for the original experiment code.

Was that a real undercoverage? We predicted before running that it was noise (at least 93.0% over 2,000 fresh draws) and that the width would stay within 3%.

**Result.** 94.1% coverage (standard error 0.5), half-width 1.165 points against 1.152. By blocks of 500 draws the coverage was 94.6, 94.6, 93.8 and 93.4%, so the single 500-draw run that gave 92.0% was a low draw, not a defect.

**Caveats.** One category, one coder, and the data-dependent choice between pooled and coder-cell designs still has no coverage theorem. The code and log are in the project's `experiments/h7d_admiration_2000.py` and `LOG.md`.
