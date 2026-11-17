---
title: "Reserving fresh labels for a misjudged pilot: the check now works, and still costs too much"
seo_title: "LLM coding audits: reserved labels give a check reach, not price"
date: 2026-11-17
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered, 157 cells: reserving 10% of the audit for a second-phase check repairs 4 of 7 failing cells but keeps only 35% of the width gain."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The library's audit rule
hand-codes a pilot of 70% of the budget. If the model looks informative, it
splits the rest of the audit by the model's own label.

Seven cells still undercover once that split is chosen: 62.5 to 87.6% coverage
against a nominal 95%. All of them have weak coders whose pilots under-saw the
coder's misses. [This morning's run](2026-11-17-second-phase-check-has-no-labels-to-check.md)
tried to catch them with the labels drawn after the split, which the pilot never
saw. It failed, and the diagnosis was that the design left the cell needing the
check with almost no labels to check it with.

## The test

So give it labels. Before any label is seen, reserve a fixed share of the audit
(10% or 20% of n) for the coder-negative cell's second phase, taken out of the
coder-positive cell's allocation, so the budget doesn't change. I committed four
variants, predictions and a decision rule before any draw
([`h7bc_reserved_check.py`](../../research/llm-coding-inference/experiments/h7bc_reserved_check.py)),
then ran 1,000 audits in each of the same 157 cells (GoEmotions and NaijaSenti;
logistic, naive Bayes and zero-shot Qwen coders).

| rule | failing cells lifted to 88%+ | GoEmotions width gain kept |
|---|---|---|
| default | 0 of 7 | 100% |
| reserve 10%, no check | 1 of 7 | 97.7% |
| reserve 10% + variance max | 4 of 7 | 34.9% |
| reserve 20% + variance max | 5 of 7 | 27.8% |
| reserve 10%, two-phase cell | 7 of 7 | −1,672% |

None qualifies under the committed rule, so the default stays
([summary](../../research/llm-coding-inference/experiments/h7bc_reserved_check.txt)).
That is the outcome I wrote down in advance. The way it failed is still worth
reporting.

## What it shows

**The diagnosis was half right.** With labels, the check finds the failing
audits. The variance maximum lifts 4 of the 7 cells instead of 2. One cell went
from 69.8% to 90.7% at the 20% reserve.

**Moving labels is nearly free.** Taking 10% of the audit away from the cell
where the allocation wanted it costs 2.3% of the width gain. On its own it also
lifts two cells partway (72.8 to 82.7%, 62.5 to 75.0%), just by diluting the
reused pilot with fresh labels.

**The maximum is what costs, and more labels don't make it cheaper.** The
maximum of two unbiased variance estimates is biased upward, and every audit
that splits pays that bias, including the good coders that never needed
rescuing. It keeps about 35% of the gain with a reserved sample, which is what it
kept with a handful of labels in the earlier run. A 20% reserve costs more, not
less, because those labels come out of the cell where the precision is earned.

## Next

The reservation is cheap, so the next step builds on it. It swaps the biased
maximum for something that isn't biased upward: a variance pooled over the
pilot and the reserved sample, or the maximum applied only when a test on the
reserved sample rejects the pilot's estimate. The test now has the labels to
work with. That run will be pre-registered on the same 157 cells. Details are in
the [research log](../../research/llm-coding-inference/LOG.md).
