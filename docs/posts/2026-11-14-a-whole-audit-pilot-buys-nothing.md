---
title: "Making the pilot the whole audit buys nothing, and an identity explains why"
seo_title: "LLM coding audits: pilot size, post-stratification and a 0.7 default"
date: 2026-11-14
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered on 18 fresh cells: a 70% hand-coded pilot holds up, and a 100% pilot gains nothing, since post-stratifying equals the control variate."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library's audit starts with a random,
hand-coded pilot. If the pilot shows the model missing at least 3 positives, the rest
of the hand-coding is split between the model's "yes" and "no" piles. Otherwise the
rest is drawn at random.

[This morning's step](2026-11-14-a-bigger-pilot-and-a-budget-leak.md) raised the
suggested pilot from 30% of the audit to 70%, on the 51 cells every earlier rule had
been tuned on. The width gain was still rising at 70%, so the obvious next guess was
that a pilot of the whole audit would do best. This step tested both: whether 70%
holds on new data, and whether bigger is better.

## What was tested

The prediction and decision rule were committed before any draw. There were 18 new
cells: six GoEmotions categories this line of work had never used (approval, caring,
optimism, surprise, excitement and annoyance). A simple word-based classifier coded
each one, with audits of 500, 1,000 and 2,000 items. The 51 old cells were rerun too.
Every cell got 1,000 simulated audits, at pilot shares from 30% to 100%.

## What happened

| Pilot share | Gain, 51 old cells | Gain, 18 fresh cells |
|---|---|---|
| 30% | 2.97 | 0.45 |
| 50% | 4.39 | 0.67 |
| 70% | 5.12 | 0.83 |
| 80% | 5.31 | 0.97 |
| 90% | 4.62 | 0.96 |
| 100% | -0.19 | -0.03 |

*Gain is the sum over cells of (1 minus the interval width over a plain random
audit's). Higher is better.*

- **70% held up on the fresh cells.** It gained more than 50% and covered the truth
  in at least 93% of audits in every fresh cell, so the default stays.
- **I predicted the gain would keep rising to 100%. It peaks at 70 to 80% and then
  collapses.** At 100% the split design was used in up to every audit of a cell and
  was still no narrower.
- **Why, as an identity.** When the model's code is 0 or 1, a straight line fitted
  through the hand labels passes exactly through the two piles' averages. So on the
  same random sample, sorting by the model's label after the fact gives the same
  estimate as the plain audit's control-variate correction. A check over 300 samples
  found them equal every time, and that is now a unit test. The split design wins
  only by choosing where the labels left after the pilot go. A bigger pilot makes the
  3-miss check pass more often but leaves fewer labels to place, which is why the
  best share sits in the middle. On the old cells it was 80% at 500 and 1,000 items,
  and 70% at 2,000.
- **80% gained most but failed the bar set in advance.** It covered 92.6% in one
  fresh cell (caring, 1,000 items). In another cell every rule, the plain audit
  included, covered under 93%. A post hoc check with 10,000 more audits put the plain
  audit there at 95.5%, so that one was a run of bad luck in the random draws shared
  by every rule. The caring cell is not explained that way.

## What it means

For anyone running this kind of audit: hand-code a random pilot of about 70% of
the budget. Split the rest by the model's label only if the pilot shows the model
missing at least 3 positives. Don't hand-code everything at random and sort it by the
model's label afterwards, expecting a narrower interval. That gives exactly the
estimate the standard correction already does.

One weak spot grew more visible. With weak coders, the audits whose pilot passed the
check covered under 88% of the time in 3 to 5 cells at each share from 50% to 80%. The pilot that
chooses the design is also part of the estimate, and fixing that is the next step.

Limits: one run, 1,000 draws per cell (about plus or minus 1.4 points of coverage),
one classifier family on the fresh cells, four of whose six coders are weak. Every
number is in the [research log](../../research/llm-coding-inference/LOG.md) and
[`h7as_fresh_share.txt`](../../research/llm-coding-inference/experiments/h7as_fresh_share.txt).
