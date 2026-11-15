---
title: "\"Much better\" or \"a bit better\": graded picks on a decision matrix, and the stop rule they nearly broke"
seo_title: "Graded pairwise picks: an ordinal Bradley-Terry decision matrix"
date: 2026-11-14
tags: [statistics, pairwise-comparison, bradley-terry, decision-making, quick-pick]
description: "Graded picks on a decision matrix: on 300 simulated people the true best came first 182-203 times against 165, once the stop stopped trusting 'much' too far."
---

The [weigh-criteria page](https://marisstella.app/quick-pick-survey/decide.html)
builds a weighted decision matrix from "this or that?" answers. You answer
"which matters more?" about criteria and "on this criterion, which is better?"
about options. Until today each answer was one bit: left or right. This
morning's diagnostic found where the error was. With the true option scores
plugged in, the shown order's agreement with the truth rose from 0.70 to 0.90.
With the true weights plugged in, it rose only to 0.77. The scores were the
bottleneck. So each pick now has two buttons per side, **Much better** and
**A bit better**.

## The model

A graded answer is only worth something if the fit reads it correctly. The
person feels a gap `z = (x_A - x_B) + noise` with logistic noise. They say
"much" when the gap is past a threshold `tau`, and "a bit" when it is not.
Integrate the noise out and both answers become sums of log-sigmoid terms:

- much A: `log sigma(d - tau)`
- a bit A: `log sigma(d) + log sigma(tau - d)` (plus a constant)

Both terms are concave, so Newton's method and the Laplace covariance work
exactly as they did for plain picks. One property makes the change safe for
links people have already shared: an ungraded pick is just the two graded
answers added together, which is the plain Bradley-Terry win. Old decision
codes therefore fit exactly as before, to 1e-9 (a test pins this).

## What it bought

The test bed was this morning's 300 simulated people, with one change. The
pick comes from the same random draw as before, so it does not change, and
the grade is whether the felt gap passed the person's own threshold.

| reading | Spearman with the truth at the cap | true best named (of 300) |
|---|---|---|
| plain picks | 0.631 | 165 |
| "much" counted as two wins | 0.636 | 175 |
| ordinal model, threshold matched | **0.709** | 198 |

Counting "much" as two wins, the obvious hack, bought almost nothing. The
gain comes from the model.

## What it nearly broke

The page stops when it is 90% sure no option beats the leader by more than a
practical tie. That promise depends on how far the fit trusts "much". Take a
person who says "much" for 63% of their picks, so their own threshold is
lower than the model's. The stop then kept its 90% promise in only 77% of
the runs it ended. For someone at 80% "much" it fell to 66%. That is worse
than plain picks, which held at 90%.

The first fix I tried was to estimate each person's threshold from their own
answers. It recovered the threshold well (mean 1.22, 2.28 and 3.38 for people
at 1, 2 and 3), but the stop still read 0.79 to 0.87. A point estimate of a
nuisance parameter is still a point estimate.

The fix that worked borrows the list ranker's second check. Once the usual
check passes, the page refits the answers at a cautious threshold: the lower
of 1 and the person's own estimate. At that reading "much" counts for little
and "a bit" is close to a tie. The page stops only if that refit passes too.
A threshold of 1.5 was not cautious enough (0.84). With 1, the promise held at
0.91 to 0.97 for every kind of person tried except the most extreme one
(0.86 at 80% "much").

| shipped page, person's "much" share | picks to stop (300 people) | true best named | true best more than a tie ahead |
|---|---|---|---|
| plain picks, before | 28,510 | 165 | 83 |
| 19% | 30,487 | 182 | 62 |
| 36% | 28,762 | 203 | 42 |
| 63% | 25,063 | 186 | 61 |
| 80% | 25,103 | 192 | 67 |
| inconsistent (threshold 0.5-4, per answer) | 29,325 | 185 | 65 |

So the trade is about the same number of questions and a better winner for
every kind of person, with an honest stop. Graded answers do not close the
diagnostic's gap: on 8 options and 4 criteria the order went from 0.747 to
0.783, while true scores give 0.90. Most runs still end at the question cap,
so a larger cap is the next thing to measure.

None of this is real people. Whether people use "much" consistently, and how
often, is the question only a real survey answers. The guard is there so a
wrong guess about that costs questions, not honesty.

The code, the simulation and every row are in the repository:
`ventures/quick-pick-survey/site/graded-fit.mjs`,
`scripts/decide-graded-sim.mjs` and `docs/DECIDE-PAGE.md`, "Graded answers".
