---
title: "Battery design triage saves DFN cycles in hindsight, then misses on the next batch"
seo_title: "Battery design triage: DFN savings that missed on a new batch"
date: 2026-11-19
tags: [research, batteries, pybamm, lithium-plating, design-search]
description: "Running only drift-flagged battery designs longer beat every uniform run length in hindsight. Picked on two design pools, it missed on the third 8 times in 12."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how cheaply
a lithium-ion electrode design search can use the full porous-electrode model
(DFN) and still forecast fade. The previous step
([simulate only the risky designs longer](2026-11-19-simulate-only-the-risky-battery-designs-longer.md))
found that a ten-cycle drift score can pick which designs to run on to cycle
50, and on two of four parameter sets that keeps the 50-cycle forecast's tail
accuracy for about half the DFN cycles. That result rested on one target and
one extension length. This step widened both, and added a test of whether the
choice holds up on designs it was not picked on.

## What was run

No new simulation. The 104 PyBaMM DFN designs from earlier milestones already
carry the cycle-99 lithium-loss forecast error for fade-law lines fitted on
10, 15, 20, 30, 40 and 50 cycles. Two policy families were compared on each
parameter set:

- **Uniform:** every design runs k cycles, so the cost is k cycles per design.
- **Triage:** every design runs 10 cycles, and the fraction f with the largest
  drift score runs on to K1 cycles (15 to 50), so the cost is 10 + (K1 - 10) f.

Each family was scored by the fewest cycles per design that bring the upper
quartile of the error to t times the all-50 figure, for 21 targets from
t = 1.00 to 2.00. Random flags and flags chosen by each design's own gain
(an oracle) bracket the drift score. Four hypotheses were written down and
committed before any of this was computed
([log, milestone 7e](../../research/cell-fidelity/LOG.md)).

## What came out

In hindsight, triage wins. It was strictly cheaper than the best uniform run
length at 14, 18, 21 and 21 of the 21 targets on the four sets. Averaged over
the targets, it saves 55%, 61%, 33% and 46% of the cycles that running every
design to cycle 50 would cost. The best uniform run length saves 36%, 39%, 27%
and 18%, and random flags 48%, 52%, 30% and 31%.

The extension has to be long. On three of four sets, a 30-cycle line is still
1.3 to 1.8 times as wrong at the upper quartile as a 50-cycle one. So 30
cycles cannot reach 7d's target (1.25 times the all-50 error) even if every
design gets them. The savings come from running a few designs long, not many
designs a little longer.

Then came the test that matters for a real search. For each set, the cheapest
triage policy meeting the target was picked on two of the three design pools
and applied to the third. It met the held-out pool's target in 4 of 12 folds.
A uniform run length picked the same way met it in 7 of 12, at a higher cost
(41.7 cycles per design against 27.3, a post hoc figure). Both fall short of
the 8 of 12 the plan asked for, and triage falls shorter.

## Why it misses

A triage policy bets that a few designs carry the tail. In a batch of 8
designs the upper quartile is the second-worst design. If the score misses
that one design, the whole target is missed. On `NCA_Kim2011`'s third pool,
half the designs ran to cycle 50 and the upper-quartile error was still 6.0%
against a 3.1% target. A uniform run length spreads its bet over every design,
so it misses less often but pays for that on every candidate.

So the savings in 7d and here are a ceiling measured in hindsight, not a rule
a search can adopt yet. The next step is the margin: set a flag threshold, or
a larger flagged fraction, on held-out pools, score it by missed targets as
well as cycles, and check it on a fresh fourth pool.

## Limits

There are 24 to 28 designs per set and 8 to 12 per pool. The drift score was
fitted with every pool's data, which flatters it in the transfer test, so the
negative result stands. Everything here comes from one fade-law form, one
PyBaMM version and modelled fade, with no measured cells. Numbers are in
[`experiments/frontier7e/results.txt`](../../research/cell-fidelity/experiments/frontier7e/results.txt),
with a figure in
[`frontier7e.svg`](../../research/cell-fidelity/experiments/frontier7e/frontier7e.svg).
