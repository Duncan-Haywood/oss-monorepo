---
title: "The guard was the cost: a new default for auditing LLM-coded data"
seo_title: "LLM coding audit: tau 0.1, no prevalence guard (pre-registered)"
date: 2026-11-11
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 10 cells: a minimum pilot informedness of 0.1 keeps 97% of a middling coder's width gain; the old 20-positive guard alone gave up 15%."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few items people need to hand-code after a language model has coded a corpus, if the
interval for a category's share is still to be honest. The audit can split the
hand-coded sample into the coder's own positives and negatives. That only pays when
the coder carries signal, so a pilot screen decides. Earlier today a
[pre-registered run](2026-11-11-a-tenth-of-informedness-is-enough.md) found that a
minimum pilot informedness (tau) of 0.1 to 0.2 keeps a useless coder out. But it had
only tried coders at the two ends: nearly useless (informedness 0.03) and good (0.39
to 0.65).

This step tried the middle: a 0.5B-parameter Qwen model coding GoEmotions fear and
sadness, informedness 0.26. I wrote the forecasts and the decision rule into the
script before any draw and committed them first. Then 1,000 simulated audits per cell
and rule:

- At 2,000 hand-coded items, tau 0.1 kept 97% of the width this coder buys. tau 0.2
  kept 81%, tau 0.3 only 45%. For a middling coder, higher thresholds turn away
  pilots that would have paid.
- The library's old screen (tau 0.3 *and* at least 20 positives in the pilot) gave a
  1.5B coder's fear cell a ratio of 0.999 to a plain audit. Dropping the 20-positive
  guard alone gave 0.847. At 1.15% prevalence a 1,000-item pilot holds about 11
  positives, so the guard almost never let the split happen. The guard was the cost,
  not tau.
- The forecast formula matched the observed share of split audits in all 40 rows it
  covers, within 3.0 points. Coverage stayed at 93.4% or more in every cell for every
  rule.

The pre-registered rule said to change the library default if those bars held, and
they did. `llmci.audit_design` now ships tau 0.1 with no prevalence guard (the
three-miss negative-cell guard stays). The price is real and small: at 500 hand-coded
items the weaker coders' intervals come out 1.4 to 2.7% wider than a plain audit,
where the old screen never fired. The gain is 6 to 29% narrower intervals at 2,000.

Limits: one corpus, one model family, one run per cell. Next is a small-sample rule
for weak coders and a second model family. Details are in the
[LOG](../../research/llm-coding-inference/LOG.md).
