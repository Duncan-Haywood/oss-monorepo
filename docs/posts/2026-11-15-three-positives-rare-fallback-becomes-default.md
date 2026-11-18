---
title: "Fewer than three positives in the audit: the hand labels now close the interval"
seo_title: "LLM coding audits: a rare-count fallback for valid intervals"
date: 2026-11-15
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered: small audits at 1 to 2% prevalence also broke the pooled interval. A Wilson fallback at under 3 positives fixed all 47 such cells."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus.
[The last step](2026-11-15-the-pooled-interval-breaks-below-one-percent.md) found
that the library's pooled interval stops being valid below about 1% prevalence. The
audit holds only a handful of real positives, and the standard error is estimated
from them. A fallback fixed it: when the audit holds fewer than 5 positives, ignore
the model and put a Wilson interval on the hand labels. But the fallback failed the
bar committed in advance, so it shipped as an opt-in.

That bar had two flaws, and both were recorded. Its "do no harm" clause compared
against the wrong reference. Its width clause also counted narrow intervals as gains
even where they missed the truth. This step fixed both clauses, then tested on audits
nobody had run.

## What was tested

The prediction and decision rule were committed before any draw. Four fallbacks were
tested, each only on a pooled audit:

- **w5**: Wilson on the labels when the audit holds fewer than 5 positives (the
  existing opt-in);
- **w3**: the same at fewer than 3;
- **w5f**: w5 with a finite-population correction;
- **w5k**: w5, plus a trigger that fires when the model-based interval claims an
  implausibly large effective sample.

The run covered 139 cells. 117 were from the last step. 22 were new: eleven GoEmotions
categories at 0.5 to 2% prevalence, with audits of 200 and 300. That is 1 to 6
expected positives per audit. Each cell got 1,000 simulated audits. To qualify, a
fallback had to meet three conditions:

- cover 93% in every cell under 1% prevalence and in every new cell;
- harm no cell where the shipped interval already covered;
- keep 95% of the width gain, counted only where the shipped interval was valid.

## What happened

The problem is not only about very rare categories. With an audit of 200, the bare
interval covered under 93% in 9 of the 11 new cells: embarrassment 65.8%, remorse
76.7%, desire 80.0%, fear 84.4%, and down to 92.8% at 1.6% prevalence. At 300 it
failed in 3 of 11. I had predicted 4, so that part of the prediction is marked
refuted.

| Fallback | Lowest coverage, 47 rare or new cells | Width gain kept |
|---|---|---|
| none (shipped) | 1.6% | 100% |
| w5 | 93.6% | 90.6% |
| **w3** | **93.6%** | **97.0%** |
| w5f | 83.0% (grief, audit of 200) | 96.7% |
| w5k | 93.6% | 90.6% |

Only w3 met all three conditions. By the committed rule it is now the library
default: `audit_interval` uses `RARE_FALLBACK = 3`, and `rare_fallback=None` turns it
off. It never fired in a category at 3% prevalence or more. The coder-reading trigger
added nothing over w5. The model-based interval's error estimate collapses only when
positives are few, and the count already catches that. The corrected version failed
for an instructive reason. With one positive in 200 labels, its lower bound rises past
the true 0.09%.

## Limits

This is one run, at 1,000 draws per cell (plus or minus 1.4 points), on one corpus.
The new cells use one word-based classifier. w3 was the cheapest of four candidates
judged on the same draws, and the 95% bar was set after seeing the last step. So the
default needs a fresh check on a second corpus and with an LLM coder, and that is the
next step. Results:
[`h7aw_rare_fallback_fresh.txt`](../../research/llm-coding-inference/experiments/h7aw_rare_fallback_fresh.txt).
