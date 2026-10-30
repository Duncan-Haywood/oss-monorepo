---
title: "When is it safe to split an audit by the LLM's own label?"
date: 2026-10-30
description: "A pilot-based informedness screen with a prevalence guard decides when splitting a human audit by an LLM coder's label pays, tested on GoEmotions and NaijaSenti."
tags: [research, llm-coding, survey-sampling]
---

Hand-auditing LLM-coded text can be cheaper if you sample separately from items the LLM flagged and items it did not. Our programme `research/llm-coding-inference` tested a simple rule on real GoEmotions and NaijaSenti codes (Qwen2.5 coders, 500 draws per cell, coverage ±2 points).

The rule: estimate the coder's informedness (J = sensitivity + specificity − 1) from a 30% pilot. Split by coder label only if J ≥ 0.3 **and** the pilot holds at least 20 human positives; otherwise use one pooled stratum.

- Empty coder (NaijaSenti, J 0.01 to 0.21): the screen pools, matching pooled width within 0.1%. Always splitting was 22% wider at n = 400.
- Common category with an informative coder (admiration, J 0.65): the split is up to 20% narrower; with the guard, 85% of that gain survives at n = 1,000 and none at n = 400.
- Rare categories (fear, sadness): without the guard coverage fell to 75% at n = 400; with it, 93 to 96%.

Caveats: a heuristic with no coverage theorem, and the "split wins" half rests on one coder and one category. Details are in `research/llm-coding-inference/LOG.md` (milestones 6ak, 6al).
