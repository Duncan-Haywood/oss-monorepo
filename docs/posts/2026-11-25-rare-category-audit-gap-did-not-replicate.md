---
title: "A cheap fix for the rare-category audit gap passed every test, and the gap didn't show up"
seo_title: "Rare-category LLM audits: a cheap fix passes, the gap vanishes"
date: 2026-11-25
tags: [research, llm-coding-inference, qualitative-coding, rare-categories, pre-registration]
description: "A pre-registered fix for audits that draw 7 to 9 positives held 93.9% coverage at 0.7% width. This time the default never fell under 93% in any cell."
---

The `llm-coding-inference` programme asks how small a hand-coded audit can be
when a language model codes a corpus and you want a valid 95% interval for how
common a category is. Two runs ago we found a small gap just above the
library's rare-count fallback. At about 2% prevalence, with an audit of 200
hand labels, coverage sat up to a point under our 93% line. The misses came
from audits that happened to draw 7 or more positives, where the interval's
lower bound sat above the truth.
[The last run](2026-11-24-rare-category-audit-hull-fix-costs-too-much.md)
fixed that with a hull. It reached 95.7% coverage everywhere but widened
intervals by 4.5%, well over our 1% budget.

This run (milestone 7bi) tested a narrower fix, with the prediction and the
decision rule committed before any draw. It lowers only the lower bound, and
only when the audit holds 7 to 9 positives.

## What ran

- **52 fresh cells:** GoEmotions comments with positives re-thinned (a new
  seed) to 1 to 2.5%, coded zero-shot by Qwen2.5-1.5B and Qwen2.5-0.5B.
  39 cells sit just above the trigger (3 to 5 expected positives). 13 are
  "cost cells": audits of 300 at 2 to 2.5%, where 7 to 9 positives are normal
  rather than a tail, so the fix fires most and its price shows.
- **2,000 simulated audits per cell** (margin about plus or minus 1 point).
- **The bar, fixed in advance:** the default had to miss in at least 2 cells
  for there to be a gap to fix. The fix then had to cover 93% everywhere and
  add at most 1% width on average and 5% in any cell.

## What it found

| Rule | Lowest coverage | Mean near the trigger | Extra width vs default |
|---|---|---|---|
| Default (rare-count fallback) | 93.0% | 95.1% | — |
| Lower bound only, 7 to 9 positives | 93.9% | 96.2% | +0.7% (largest +3.3%) |
| Same at a 90% level | 93.9% | 95.6% | +0.3% |
| Lower bound only, 5 to 9 positives | 93.9% | 97.1% | +2.1% |
| Lower bound only, 3 to 9 (last run's) | 93.9% | 97.2% | +3.7% |

- **The gap did not replicate.** The default covered 93.0% or more in all 52
  cells. Its lowest cell is the same corpus that missed before (sadness at 2%,
  audits of 200). That corpus has now covered 91.6, 92.7, 92.0 and 93.0% over
  four runs.
- **The narrow fix passed every check,** at about a sixth of the last fix's
  width. Coverage in audits that drew 7, 8 or 9 positives rose from 89.9, 87.0
  and 81.6% to 92.5, 95.8 and 92.7%.
- **By the committed rule the library doesn't change.** With no gap on these
  draws, there was nothing for the fix to repair.

## What it means

Over the last three runs, the default missed 93% in 5 of 112 cells near the
trigger. All five were audits of 200 at 2% prevalence, and each missed by a
point or less, inside a single cell's noise. Three of them are the same
thinned corpus, so they aren't independent. The honest reading is a gap of at
most about a point that no run has yet separated from noise. If an independent
check confirms it, the 7-to-9 lower-bound band is now the cheapest repair on
file.

For a practitioner, the advice from the last run stands. At about 2%
prevalence, hand-label 300 items rather than 200. Every audit of 300 across
these runs covered 93% or more.

The next step is to test the sadness question on independent corpora, using
other categories and several thinning seeds rather than more draws on the
same 133 positives. Code, draws and the per-cell tables are in
[`research/llm-coding-inference`](../../research/llm-coding-inference/)
(`experiments/h7bi_lower_band.py`). This research was carried out with AI
assistance.
