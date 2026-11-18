---
title: "Below 1% prevalence, the audit's own interval stopped being valid"
seo_title: "LLM coding audits: confidence intervals fail for rare categories"
date: 2026-11-15
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered: the pooled interval covered under 93% in 13 of 21 GoEmotions cells under 1% prevalence, down to 1.6%. A Wilson fallback fixes all 21."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The last few steps went
after a subtle problem: the rule that splits the hand-coding between the model's
"yes" and "no" piles covers badly in a minority of audits with a weak model
([the last step](2026-11-15-a-variance-floor-that-costs-the-whole-gain.md)).

This step checked something more basic: the plain pooled interval, which every one
of those comparisons uses as its reference.

## The problem

The pooled interval uses the model's codes as a control variate. That shrinks the
standard error when the model is informative. But the standard error is estimated
from the audit, and for a rare category the audit holds only a handful of real
positives. If it holds none, the estimated standard error is zero and the interval
collapses to a point near zero, which misses the truth.

## What was tested

The prediction and decision rule were committed before any draw. Four fallbacks
were tested. Each applies only when the audit holds fewer than 5 (or 10) human
positives, and only to a pooled audit:

- **Wilson on the labels** (at 5 or 10 positives): ignore the model and put a Wilson
  interval on the hand labels alone;
- **Clopper-Pearson**: the exact binomial interval on the labels;
- **hull**: the union of the shipped interval and the Wilson one.

There were 117 cells: the 105 from the last step, plus 12 new ones on GoEmotions
grief, pride and relief (all under 0.4%), with audits of 200 to 2,000 items. Every
cell got 1,000 simulated audits. To win, a fallback had to cover 93% in every cell
under 1% prevalence. It also had to keep 98% of the shipped rule's total width gain.

## What happened

The shipped interval covered under 93% in 13 of the 21 rare cells:

| Category (prevalence) | Audit size | Shipped coverage | Wilson fallback |
|---|---|---|---|
| grief (0.09%) | 200 | 1.6% | 99.2% |
| grief (0.09%) | 1,000 | 58.0% | 94.2% |
| pride (0.15%) | 500 | 46.0% | 96.4% |
| relief (0.34%) | 200 | 45.2% | 96.8% |
| nervousness (0.28%) | 500 | 72.1% | 95.2% |
| embarrassment (0.54%) | 500 | 88.2% | 95.1% |

Every fallback brought all 21 rare cells to 93.6% or more, and none fired in more
than 6 of 1,000 audits where the category is at 3% or more. But none kept 98% of the
width gain. The Wilson fallback kept 89.7%. So, by the rule committed in advance, the
default did not change.

Most of that "lost gain" is not a real loss. About 60% of it sits in three cells
where the shipped interval was invalid to begin with, so it was gain against a
reference that was too narrow. The rest, about 4% of the gain, is real. It falls in
cells at 0.3 to 1.7% prevalence, mostly with audits of 500. That was a flaw in how
the bar was written, and it is recorded as such. The library now offers the fallback
as an opt-in, `audit_interval(..., rare_fallback=5)`, with a note to use it whenever
the audit may hold fewer than about 5 positives.

## What it means

If you audit a rare category with a few hundred hand-coded items, the model can't
rescue the interval: with almost no positives in the audit, there is nothing to
estimate the error from. The hand labels alone still give a valid binomial interval,
and that is what to report. The width gains this programme reported below about 1%
prevalence at small audits partly came from this undercoverage. The paper now says
so.

Limits: one run, 1,000 draws per cell (plus or minus 1.4 points), one corpus, one
word-based classifier on the new cells. Results:
[`h7av_rare_fallback.txt`](../../research/llm-coding-inference/experiments/h7av_rare_fallback.txt).
