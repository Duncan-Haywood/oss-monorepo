---
title: "A variance floor fixes the bad audits and costs the whole gain"
seo_title: "LLM coding audits: a variance floor fixes coverage, erases the gain"
date: 2026-11-15
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered on 105 cells: flooring the variance of the model's 'no' pile repairs 6 of 8 undercovering cells but gives back 62% or more of the width gain."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library starts with a hand-coded
random pilot of 70% of the audit. If the pilot shows the model is informative and
missing at least 3 positives, the rest of the hand-coding is split between the
model's "yes" and "no" piles. Otherwise the rest is drawn at random.

[The last step](2026-11-14-a-stricter-screen-keeps-the-wrong-pilots.md) found where
this goes wrong. With a weak model, take only the audits where the rule chose the
split. In a handful of cells those audits cover the truth less than 88% of the time,
against a 95% target. A stricter test for letting the model in did not help. The
failing audits were the ones whose pilot happened to see few of the model's misses.
That made the model look better than it was and made the "no" pile look less
variable than it was. The fix it pointed to was on the variance side: stop the "no"
pile's variance from coming out too small.

## What was tested

The prediction and decision rule were committed before any draw. Four floors were
tested. Each changes only the interval, not the plan or which items get hand-coded,
so every rule saw the same audits:

- **plus-two** and **plus-four**: count the "no" pile as if it held 2 (or 4) more
  positives and 2 (or 4) more negatives when working out its variance;
- **Wilson**: floor the variance at what the upper end of a one-sigma Wilson
  interval for the pile's miss rate would give;
- **plus-two in both piles**: the library's older floor, kept for comparison.

There were 105 cells: the 87 from the last step plus 18 new ones. The new cells used
the word-based classifier on six GoEmotions categories it had not been run on in
this line of work, with audits of 500, 1,000 and 2,000 items. Every cell got 1,000
simulated audits. To win, a floor had to lift the weak-model split audits to 92%
coverage overall, leave at most one cell under 88%, and keep 90% of the width gain.

## What happened

| Rule | Weak-model split audits covered | Cells still under 88% | Width gain kept |
|---|---|---|---|
| no floor (shipped) | 94.7% | 8 | 100% |
| plus-two | 96.8% | 2 | 37% |
| plus-four | 97.7% | 2 | -19% |
| Wilson | 97.5% | 2 | -3% |
| plus-two, both piles | 96.8% | 2 | 37% |

*Gain is the sum over the 105 cells of (1 minus the interval width over a plain
random audit's). A negative share means the rule ends up wider than a plain random
audit overall.*

- **The defect showed up again on new data.** One fresh cell (disapproval, 1,000
  items) joined the seven from last time, at 87.6% over 258 split audits.
- **The floors work where they were aimed.** Six of the eight cells recover. Caring
  at 1,000 items goes from 87.8% to 96.9% or better, and annoyance at 500 from 82.5%
  to 100%.
- **Two cells stay broken under every floor.** These are the two with the fewest
  split audits, 35 and 43: one at 82.9 to 85.7%, the other at 76.7 to 83.7%.
- **The price is the method.** I guessed the floors would keep 80 to 99% of the
  gain. The best kept 37%. Under plus-two, the rule is wider on average than a plain
  random audit in 32 of the 46 weak-model cells that ever use the split, and in 10 of
  the 36 cells with a good model. On the new cells every floor gives up more than the
  whole gain.

So no floor qualifies, and the library's interval stays as it was.

## Why

By design the "no" pile holds few positives, which is why it is cheap to estimate.
Its variance comes from a handful of misses. A floor big enough to rescue the
audits whose pilot saw too few misses is big compared with every audit's variance,
and it is paid in all of them. The undercoverage sits in a minority of audits (the
split ones) within a minority of cases (weak models). This step and the last one now
agree: a fix applied to every audit, whether on who gets in or on the variance,
costs more than the problem.

## What next

The next candidates act only when the pilot's evidence is thin. One is a floor that
switches on only when the "no" pile holds few audited positives. Another hand-codes
the "no" pile in a fresh second phase and prices that honestly when choosing the
plan, so the rule falls back to a plain random audit whenever the honest interval
would not gain. The paper's limitations section now states both negative results
with these numbers.

Code and numbers: [`h7au_neg_floor.py`](../../research/llm-coding-inference/experiments/h7au_neg_floor.py),
[`h7au_neg_floor.txt`](../../research/llm-coding-inference/experiments/h7au_neg_floor.txt),
and the [research log](../../research/llm-coding-inference/LOG.md).
