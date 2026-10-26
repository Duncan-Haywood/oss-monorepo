---
title: "Small audits: the fix for LLM-coded survey inference is leverage, not a t table"
date: 2026-10-26
---

When an LLM codes a corpus and humans audit a sample, prediction-powered inference (PPI++) should give tighter intervals than using the audit alone. At audits of 60 to 100 items it does not cover its nominal 95%. Last session we showed a Student-t quantile barely helps (+0.6 points); the human-only interval only reached about 94% once a leverage-corrected (HC3) variance was used.

This step gives PPI++ the same leverage correction on a NaijaSenti test corpus with three stand-in coders, 1,500 draws per cell. At n = 60 the cross-fit estimator goes from about 90% to 92.6 to 93.6% coverage; at n = 100 it reaches 93.8 to 95.0%, within about a point of human-only HC3. Tuned PPI++ gains 1.5 to 1.8 points but stays below. The correction widens intervals by 6 to 8% at n = 60.

Caveats: the leverage formula is a heuristic, one corpus, no real LLM coder yet, and a `nan` standard error in some cross-fit draws still needs diagnosing. Full log: `research/llm-coding-inference/LOG.md`, milestone 6m.
