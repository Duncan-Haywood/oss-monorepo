---
title: "Pricing the repair correctly still does not beat doing nothing"
seo_title: "LLM coding audits: a priced two-phase fallback vs the pilot guard"
date: 2026-11-13
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 51 audit cells: with the second-phase floor priced, the bias-free fallback nearly ties the shipped guard but never beats it."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share, once a
language model has coded the whole corpus. The library's audit rule splits the
hand-coding into the model's "yes" and "no" piles when a pilot says this will
narrow the interval. It refuses the split when the pilot holds fewer than 3
positives that the model called "no".

[The last step](2026-11-13-the-repair-that-costs-more-than-the-fault.md) tried a
fallback for pilots that fail that guard. It is a two-phase design: the pilot's
own labels count exactly, and the rest of each pile is estimated from fresh items
only. That removed the selection bias in an earlier fallback, but it lost width
overall: a total gain of 2.674 against the shipped rule's 2.760, summed over 39
audit cells. A likely culprit was named but not tested. The final interval
puts a plus-four floor under each pile's variance, computed on the small second
sample. The forecast that decides whether to split computed that floor on the
larger pilot, so it promised more than the audit could deliver.

This step tested that culprit and one more idea. The prediction and the decision
rule were committed before the full run:

- **Price the floor** at the size of the second sample (gtp2p).
- Also **keep the "yes" pile's pilot labels**, and use the two-phase estimate only
  in the "no" pile, where the guard looks (gtn2p).

## What happened

Each rule ran 1,000 simulated audits in each of 51 cells: three Qwen2.5 coders
and two logistic coders on GoEmotions, and a naive-Bayes coder and a lexicon on
NaijaSenti. Audits ranged from 500 to 2,000 items.

- **Coverage held.** Both candidates cover 93.4% or more in every cell. They
  cover 96 to 100% in the audits where the guard failed and the fallback split
  anyway. Keeping the "yes" pile's pilot does not bring the bias back.
- **Pricing the floor fixes the cells it was meant to fix.** At gratitude with
  1,000 items the ratio to a plain audit goes from 0.923 to 0.885 (shipped: 0.883).
  At love it goes from 0.860 to 0.835 (shipped: 0.832).
- **It still does not beat the shipped rule.** Total gain is 2.727 for gtp2p and
  2.712 for gtn2p, against 2.760. Keeping the "yes" pilot made things slightly
  worse, the opposite of the guess. The forecast treats those reused labels as if
  they were fresh, so it accepts more splits that turn out wider.
- The decision rule was not met, so no default changed.

## A bug the guard was hiding

A per-audit comparison found single audits about 3 times as wide as a plain one.
In one of them, the pilot held a single positive, and the model had also called
it "yes". The forecast's fitted weight is then 1 and every residual is 0, so it
cannot say anything. It returned its "no information" value of 1.0, and a gate
that accepts anything at or below 1.0 let the split through. The shipped rule
never meets such a pilot, because its guard needs 3 misses first.

The library now has a `no_info` option that sends such a pilot to the plain
audit. It is off by default, so every earlier result replays unchanged. This
check was chosen after seeing the draws, so it decides nothing. With the option
on, the priced fallback gains 2.747: closer, but still below 2.760. The shipped
rule itself is identical with or without it.

## What it means

Four steps (7am to 7ap) tried to let a strong coder past the 3-miss guard. The
only version that gained more than the guard took its gain from reusing the pilot
that chose the design, and its coverage failed exactly where the fallback was
rare. Every version whose interval stays valid given the pilot gains less than
simply falling back to a plain audit. At pilots of half the audit, the
guard stays.

That makes a clean negative result for the paper: reusing a design pilot buys
width with coverage. Next, the programme returns to the shipped rule's own open
defect, a weak coder whose admitted splits cover 83% (72 audits). It also needs to
check the `no_info` gate on fresh cells before it can become a default.

Code and tables: [`h7ap_priced_floor.py`](../../research/llm-coding-inference/experiments/h7ap_priced_floor.py),
[`h7ap_priced_floor.txt`](../../research/llm-coding-inference/experiments/h7ap_priced_floor.txt),
[`h7ap_posthoc.txt`](../../research/llm-coding-inference/experiments/h7ap_posthoc.txt).
Limits: one run, 1,000 draws per cell (±1.4 points on coverage); the conditional
splits rest on 50 to 170 audits; the pilot is always half the audit.
