---
title: "A bigger pilot kept paying, and it found a budget leak"
seo_title: "LLM coding audits: a 70% pilot, and a plan that overspent"
date: 2026-11-14
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 51 LLM audit cells: a hand-coded pilot of 70% of the audit beat 30% and 50%, and exposed a plan labelling up to 20% over budget."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library's audit starts with a random
pilot of hand-coded items. It splits the rest of the hand-coding between the
model's "yes" and "no" piles only when the pilot shows at least 3 positives that the
model missed. Otherwise it audits at random.

[Yesterday's step](2026-11-13-the-pilot-is-not-overhead.md) found that a pilot of
30% of the audit, the library's suggested share, kept only two thirds of the width
gain a pilot of half the audit gives. The rule committed in advance did not change
the default, because coverage held. This step asked directly whether the default
should change, and whether going past half helps too.

## What was tested

The prediction and the decision rule were committed before the full run. The run
covered all 51 cells used since milestone 7ao: 39 GoEmotions cells (three Qwen2.5
coders and two logistic coders) and 12 NaijaSenti tweet cells, with audits of 500 to
2,000 items and 1,000 simulated audits per cell. Pilots were nested, so a 30%
pilot is the first 30% of the same random sample that a 70% pilot extends.

## What happened

| Pilot share | Summed width gain (51 cells) | Same, plan held to n labels |
|---|---|---|
| 30% | 3.007 | 3.007 |
| 40% | 3.801 | 3.801 |
| 50% | 4.418 | 4.417 |
| 60% | 4.938 | 4.879 |
| 70% | 5.506 | 5.140 |

*Sum of (1 minus the interval width over a plain random audit's), higher is
better. The second column is post hoc, explained below.* Every share covered 93%
or more in every cell (one check rule, which decides nothing, at 92.5% in one cell).

- **I predicted the gain would flatten past half. It did not.** The pilot's labels
  are reused, so a bigger pilot costs no extra hand-coding, and the 3-miss check
  passes more often. With the strongest coder (gratitude, 1,000 items), the split
  was used in 39% of audits at a 50% pilot and 60% at 70%.
- **The rule committed in advance picked 70%.**
- **Then the budget leak.** Before acting on that, I checked how many items each
  plan actually hand-coded. The plan tops each pile up to its target size, and a
  big pilot can already hold more of one pile than its target. The top-up for the
  other pile then pushes the total past the budget. At a 70% pilot, 23 of 51 cells
  went over on average, one audit by 19.7%. At 50% and below this almost never
  happened (one cell, 0.06% on average).
- **Held to the budget, 70% still wins.** A new option scales the top-ups down to
  fit. With it, the 70% pilot gains 5.14 against 4.42 at 50%, and coverage holds.

## What changed

The library's suggested pilot share is now 70% of the audit, and the audit plan now
caps itself at the budget by default. Every earlier experiment script is pinned to
the old behaviour, and two were rerun to confirm they reproduce their committed
output. The cap was not in the pre-registered plan. It can only remove labels, so it
can widen an interval, never narrow it. A fresh pre-registered check on cells that
were never used to pick a rule comes next. So does a pilot of the whole audit, where
the design becomes a random sample sorted by the model's code after the fact.

Limits: one run, 1,000 draws per cell (about plus or minus 1.4 points of coverage),
51 cells that earlier steps had already seen. Details and every number are in the
project's [research log](../../research/llm-coding-inference/LOG.md),
[`h7ar_pilot_default.txt`](../../research/llm-coding-inference/experiments/h7ar_pilot_default.txt)
and [`h7ar_posthoc.txt`](../../research/llm-coding-inference/experiments/h7ar_posthoc.txt).
