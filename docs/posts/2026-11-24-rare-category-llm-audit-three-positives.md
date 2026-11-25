---
title: "Fewer than three positives: checking a rare-category audit fallback on 92 fresh cells"
seo_title: "Rare-category LLM audits: the three-positive fallback, rechecked"
date: 2026-11-24
tags: [research, llm-coding-inference, qualitative-coding, rare-categories, pre-registration]
description: "With 0.5% prevalence and 200 hand labels, the usual interval covers 55%. A labels-only fallback holds 93% at a 0.5% width cost; two nearby cells still miss."
---

When a language model codes a large corpus and people hand-code a small random
audit, the `llm-coding-inference` programme's library combines the two into one
estimate of how common a category is, with a 95% interval. That works when the
audit holds enough positives. When the category is rare and the audit is small,
it does not: with about one expected positive in the audit, the interval's
standard error comes from almost nothing, and the interval collapses.

Since milestone 7aw the library handles this with a fallback. If the audit holds
fewer than 3 hand-coded positives, it ignores the coder and uses a Wilson interval
on the hand labels alone. Two earlier pre-registered runs (GoEmotions with a
logistic coder, then NaijaSenti with naive-Bayes and zero-shot LLM coders) found
it valid. The second one also failed it on cost, but the cost bar was a share of
a gain that is close to zero at these audit sizes, so it was the wrong bar.

## What this run tested

Milestone 7bf fixed a new cost bar in absolute width before any draw: where the
shipped interval is valid, the fallback may widen it by at most 0.010 of the
pooled width on average and 0.050 in any cell. It then ran 92 cells nobody had
used in this line: GoEmotions Reddit comments with positives thinned to 0.5, 1
and 2% for eight emotion categories, coded zero-shot by Qwen2.5-1.5B (an
informedness J of 0.15 to 0.80), and audits of 200 to 1,000 labels, 1,000 draws
each. The prediction and the decision rule are in the script's docstring,
committed before the run.

## What it found

- **The defect is real every time.** In all 33 cells with fewer than 3 expected
  positives, the plain interval covered under 93%, as low as 55.2% (fear at
  0.5%, 200 labels). That is the third corpus and coder pair where this shows up.
  It depends on how many positives the audit holds, not on which coder you use.
- **The fallback works where it is meant to.** In those 33 cells it covered
  93.2% or more.
- **It is cheap.** Where the shipped interval was already valid (50 cells), it
  widened intervals by 0.53% on average and 2.3% at most, inside the bar.
- **Two cells miss the line.** One is sadness at 2% prevalence with 200 labels
  (91.6%): about 4 expected positives, just past the trigger. The other is
  gratitude at 1% with 1,000 labels (92.6%), on the few draws where the rule
  split the audit by coder cell, which the fallback never touches. Both are
  within about 1.4 points of the bar, which is the run's noise level. The
  pre-registered rule still counts them as failures.
- **Raising the trigger to 5 positives makes it worse.** At 0.5% and 200 labels
  the 5-positive version covered 91.3 to 92.3% in all eight categories. A Wilson
  interval on 3 or 4 positives out of 200 undercovers there. The 3-positive
  trigger avoids this because it leaves those draws to the coder-assisted
  interval. In the two earlier runs, 5 positives only looked worse on width. Now
  it looks worse on validity too.

By the committed rule the default stays at 3, and the paper now states the two
cells as a limitation. So the open problem has moved. The trigger is not the
weak point. The weak point is which interval to use when the audit holds 3 to 5
positives. A Clopper-Pearson or hull interval in that range is the next
pre-registered check.

## If you audit LLM-coded data

If your category is under about 1% and your audit is a few hundred items, check
how many hand-coded positives the audit holds before you trust any
model-assisted interval. With fewer than 3, use an exact or Wilson interval on
the labels alone. The coder adds almost nothing there, and an interval that
leans on it can be badly wrong. With about 4, expect slight undercoverage
whatever you do. Either label more items or report a wider interval.

Code, results and the full log: [`research/llm-coding-inference`](../../research/llm-coding-inference/README.md)
(`experiments/h7bf_rare_fallback_abs.py`, `h7bf_rare_fallback_abs.txt`, and the
7bf entry in `LOG.md`).
