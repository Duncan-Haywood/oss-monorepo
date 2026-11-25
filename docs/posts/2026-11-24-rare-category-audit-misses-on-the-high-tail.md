---
title: "The rare-category audit gap was on the other tail: a pre-registered check of 54 cells"
seo_title: "Rare-category LLM audits: the coverage gap is on the high tail"
date: 2026-11-24
tags: [research, llm-coding-inference, qualitative-coding, rare-categories, pre-registration]
description: "An exact interval for audits with 3 or 4 positives did not fix a 92% coverage gap. Counting misses by positives found them in audits that drew 7 or more."
---

The `llm-coding-inference` programme asks how small a hand-coded audit can be
when a language model codes a corpus and you want a valid 95% interval for how
common a category is. For rare categories the library has a fallback: if the
audit holds fewer than 3 hand-coded positives, it ignores the model and uses a
Wilson interval on the hand labels. The
[previous check](2026-11-24-rare-category-llm-audit-three-positives.md)
confirmed it below 3 expected positives but left one cell just above that range
under the 93% line: sadness at 2% prevalence with an audit of 200 (about 4
expected positives) covered 91.6%.

The working guess was that the interval used on audits with 3 or 4 positives was
too narrow. So this run (milestone 7bg) tested a fix for exactly that, with the
prediction and decision rule committed before any draw.

## What ran

- **54 cells:** GoEmotions comments with positives thinned to 1 to 3%, coded
  zero-shot by Qwen2.5-1.5B and, new to this line of work, Qwen2.5-0.5B. Audits
  of 200 and 300, so 2 to 9 expected positives.
- **2,000 simulated audits per cell,** so a gap of a point is not just noise
  (the margin is about plus or minus 1 point).
- **The candidate:** keep the default, and close audits with 3 or 4 positives
  with an exact (Clopper-Pearson) interval. Three variants ran alongside it,
  including the less conservative mid-p exact interval.

## What came out

- **The gap is real, and small.** The default dropped under 93% in 2 of the 34
  cells with 3 to 6 expected positives. Both were 2% prevalence with audits of
  200: admiration at 92.4% (a new cell) and sadness at 92.7% (it replicates
  7bf's result). The eight cells at about 4 expected positives and n = 200
  average 93.85%. Every audit-of-300 cell covers 93.3% or more.
- **The fix fails.** Clopper-Pearson lifts sadness to 93.0% but leaves admiration
  at 92.5%, and it makes intervals 3.0% wider on average where the default was
  already fine. The bar set beforehand was 1.0%. By the committed rule the
  default stays.
- **The mid-p interval is the efficient version.** It covers the same draws as
  Clopper-Pearson at an eighth of the cost: +0.35% width on average, which is
  inside the bar. It still doesn't fix admiration, so it is not adopted either.

## Where the misses actually are

The planned diagnostic sorted every simulated audit in the near-trigger cells
by how many positives it happened to draw:

| positives in the audit | audits | coverage, default |
|---|---:|---:|
| 0 | 1,033 | 51.6% |
| 1 | 4,197 | 95.2% |
| 2 to 4 | 31,299 | 99.7 to 100% |
| 5 | 10,872 | 99.1% |
| 6 | 8,200 | 97.6% |
| 7 | 5,568 | 92.3% |
| 8 | 3,311 | 84.7% |
| 9 | 1,829 | 69.1% |
| 10 or more | 1,691 | 42.5% |

Audits with 3 or 4 positives were already covered 99.7% of the time or more, so
the fix improved a tail that was not failing. The misses come from audits that
drew none, where 0 of 200 gives an upper bound of 1.9% against a 2% truth (any
95% interval on the labels shares that tail), and from audits that drew 7 or
more, about twice the expected count. There the interval's lower bound sits
above the truth too often. The table pools cells with different expected
counts, so it shows where the misses are, not the exact per-count rate.

## What changes

Nothing in the library. The gap at about 4 expected positives in an audit of
200 is about a point, and it sits on the high tail. The next pre-registered
candidate acts there: when the audit is small, take the hull of the shipped
interval and a mid-p interval on the labels. It will be priced with the same
absolute width bar and run on fresh cells, with the count table computed per
cell.

Limits: one run, one thinning per corpus, two sizes of one model family, and
misses that are a point or less under the line.

Code, draws and log:
[`research/llm-coding-inference`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/llm-coding-inference)
(`experiments/h7bg_small_count_band.py`, `LOG.md`, milestone 7bg).
