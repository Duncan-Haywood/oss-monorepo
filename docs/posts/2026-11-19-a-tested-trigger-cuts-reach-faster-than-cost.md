---
title: "Firing an audit repair only when a test flags the pilot: cheaper, and it repairs less"
seo_title: "LLM coding audits: a tested trigger cuts reach faster than cost"
date: 2026-11-19
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered, 157 cells: gating the reserved-sample check on a binomial test keeps 76% of the width gain but repairs 2 of 7 failing cells, not 4."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The library's audit rule
hand-codes a pilot of 70% of the budget. If the model looks informative, it
splits the rest of the audit by the model's own label.

Seven cells still undercover once that split is chosen, at 62.5 to 87.6% against
a nominal 95%. All of them have weak coders whose pilots under-saw the coder's
misses. [Yesterday's run](2026-11-17-reserved-labels-buy-reach-not-price.md)
reserved 10% of the audit for fresh labels in the cell the pilot misjudges. With
those labels, taking the larger of two variance estimates repaired 4 of the 7
cells, but it kept only 35% of the width gain. The maximum is biased up on every
draw, including the good coders' draws.

## The test

The obvious next move is to pay that cost only when the fresh labels say
something is wrong. A one-sided binomial test asks whether the reserved sample
holds more coder misses than the pilot's miss rate predicts, and the repair
fires only when the test rejects. I committed four variants, the predictions and
the decision rule before any draw
([`h7bd_tested_check.py`](../../research/llm-coding-inference/experiments/h7bd_tested_check.py)).
Two variants fire the variance maximum, at alpha 0.10 or 0.25. The other two
close that cell as a two-phase sample instead. Each ran 1,000 audits in the same
157 cells (GoEmotions and NaijaSenti, with logistic, naive Bayes and zero-shot
Qwen coders).

| rule | fires in good-coder splits | failing cells lifted to 88%+ | GoEmotions width gain kept |
|---|---|---|---|
| default | none | 0 of 7 | 100% |
| reserve 10% + maximum, always | always | 4 of 7 | 34.9% |
| reserve 10% + maximum, test at 0.10 | 6.1% | 2 of 7 | 75.7% |
| reserve 10% + maximum, test at 0.25 | 15.6% | 2 of 7 | 56.5% |
| reserve 10% + two-phase, test at 0.10 | 6.1% | 2 of 7 | −48.7% |
| reserve 10% + two-phase, test at 0.25 | 15.6% | 2 of 7 | −231.7% |

None qualifies under the committed rule, so the library default is unchanged
([results](../../research/llm-coding-inference/experiments/h7bd_tested_check.txt)).

## Why gating didn't save it

The test does discriminate, but only weakly. At alpha 0.10 it fires in 6.1% of
good-coder draws and in 19.7% of the draws in the seven failing cells. In those
cells most draws are fine. The bad draws are the ones where the pilot saw too few
misses, and a 10% reserve still holds only a handful of misses, so the test
misses most of them. The ungated maximum repaired 1.5B disapproval at n = 1,000
(74% to 89%) because it fired on every draw. Gated, it reaches 77 to 80%.

Each fire is also expensive. The test rejects exactly where the reserve happened
to see extra misses, which is where the maximum's upward bias is largest. Firing
in 7.8% of all split draws cost 23% of the reserved design's gain. Closing the cell
two-phase on the same trigger also pulled two more cells under 93%, the
selection effect seen [two runs ago](2026-11-17-second-phase-check-has-no-labels-to-check.md).

## Where the line stands

This is the sixth family of repair to fail the same pre-registered rule: an
admission test on the pilot, variance floors (uniform, then triggered), a
second-phase check, a reserved sample, and now a tested trigger. All of them
read the failure through a few coder-negative misses. A few misses can't tell an
unlucky pilot from a weak coder well enough to pay for the repair.

So the next step is to write this line up as one section of the paper, with its
negative stated as a result. Reusing a design pilot gives valid coverage on
average over the design choice. Given the choice, weak coders are not covered,
and no interval-side repair tested so far is worth its price. If the line
reopens, it should change the design rather than the interval.
