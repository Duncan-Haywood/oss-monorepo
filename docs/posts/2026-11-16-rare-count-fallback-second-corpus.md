---
title: "The three-positive fallback, on a second corpus: valid everywhere, and the cost bar was the wrong shape"
seo_title: "LLM coding audits: the rare-count fallback on NaijaSenti"
date: 2026-11-16
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered check on NaijaSenti with LLM coders: the bare interval covered 58% at 0.5%; the new default covered 93%+ in all 36 cells."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus.
[Yesterday's step](2026-11-15-three-positives-rare-fallback-becomes-default.md) made a
rule the library default. When the hand-coded audit holds fewer than 3 real
positives, ignore the model and put a Wilson interval on the hand labels. It was
picked as the cheapest of four candidates on the same GoEmotions draws, so it needed
a check on data that played no part in choosing it.

## What was tested

The prediction and decision rule were committed before any draw
([`h7ax_rare_fallback_naija.py`](../../research/llm-coding-inference/experiments/h7ax_rare_fallback_naija.py)).

- **Corpus:** NaijaSenti, tweets in four Nigerian languages, with "negative"
  thinned at random to 0.5, 1 and 2% of the corpus.
- **Coders:** the in-language naive Bayes coder and two zero-shot local LLMs,
  Qwen2.5-1.5B and Qwen2.5-3B, whose scores an earlier milestone had committed.
- **Audits:** 200, 300, 500 and 1,000 hand labels.

That makes 36 cells, each with 1,000 simulated audits.

## What happened

| | Bare pooled interval | With the fallback (default) |
|---|---|---|
| 0.5% prevalence, audit of 200 (all three coders) | 57.6 to 57.7% | 93.5 to 95.6% |
| 0.5%, audit of 300 | 72.7 to 74.0% | 94.0 to 95.0% |
| 1%, audit of 200 | 80.4 to 83.7% | 94.8 to 95.4% |
| lowest over all 36 cells | 57.6% | 93.1% |

**Validity replicated.** The bare interval failed in every cell with fewer than 3
expected positives, whichever coder was used. Its failure depends on how many
positives the audit holds, not on the model. With the fallback, all 36 cells
covered 93.1% or more.

**The cost clause failed as written.** I had required the fallback to keep 95% of
the shipped rule's width gain, counted where the shipped interval was valid. At these
audit sizes that gain is tiny: on average the shipped rule was 1.3% narrower than a
plain pooled audit. The fallback kept 47.7% of it, for a mean width of 0.994 of
pooled rather than 0.987. The worst cell was 3.5% wider. A bar stated as a share
breaks down when the thing it divides by is near zero. The committed decision rule
names no change for this case, and the 5-positive variant keeps even less of the
gain, so the default stays at 3.

The run also caught a bug in my own summary script. It switched the default to
the 5-positive rule when only the cost clause failed, which the committed text does
not say. I fixed it to follow the text and disclosed the fix in the
[log](../../research/llm-coding-inference/LOG.md).

## What it means

If you audit a few hundred hand labels for a category near 1%, the model's codes buy
you almost nothing. An honest interval there comes from the labels. The library now
does that automatically. The next pre-registered check will state its cost bar in
absolute width.
