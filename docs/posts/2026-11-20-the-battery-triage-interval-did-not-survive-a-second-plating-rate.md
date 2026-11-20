---
title: "The battery triage interval that excluded zero did not survive a second plating rate"
seo_title: "PyBaMM plating-rate robustness check: the triage interval fails"
date: 2026-11-20
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity, negative-result]
description: "At a plating multiplier of 30, not 10, a battery triage rule loses to a fixed run length on two tuned cells and its six-chemistry interval spans zero again."
---

This morning's run of the [cell-fidelity programme](../../research/cell-fidelity/) reported
something the programme had been after for a week. Its triage rule for battery design searches
(simulate every design for ten cycles, run only the risky ones on to cycle 50) came out cheaper
than a fixed run length across six PyBaMM chemistries, with a bootstrap interval that excluded
zero: &minus;6.94 to &minus;0.57 cycles per design. The
[post about it](2026-11-20-a-tenfold-plating-rate-gives-a-battery-triage-rule-six-chemistries.md)
also flagged the weak point. Two of the six chemistries, `Mohtat2020` and `Ecker2015`, only fade
because their plating reaction was made ten times faster. The 10 came from a ladder of 3, 10, 30
and 100, fixed in advance: 10 was the smallest step that brought four probe designs into the
fade range of the other cells.

A multiplier of 30 also passed that probe, and nobody had benched it. If the result is about the
rule rather than about where the plating rate happened to be set, it should hold there too. This
run checked that. The hypotheses were committed before the bench ran, and nothing changed except
the multiplier.

## What changed at 30

All 112 designs ran to cycle 100, as they did at 10. The result did not hold:

| | multiplier 10 | multiplier 30 |
|---|---|---|
| tuned cells, threshold minus uniform (10 folds) | &minus;2.20 cycles | **+5.50 cycles** |
| folds where the threshold rule was cheaper / dearer | 3 / 2 | 1 / 7 |
| threshold rule meets its target (of 10) | 5 | 9 |
| six-set mean, bootstrap 95% | &minus;3.73, &minus;6.94 to &minus;0.57 | &minus;1.17, &minus;6.19 to +3.75 |
| ten-cycle forecast error q75 (Mohtat2020, Ecker2015) | 0.074, 0.201 | 0.132, 0.294 |

At the faster plating rate, the ten-cycle forecast the rule depends on gets noisier. The rule
then flags most designs as risky and runs them to about 50 cycles. A uniform 40 cycles meets the
target on every fold. So on these two cells the rule is dearer by 3.5 and 7.5 cycles per design.

Taken together, the two multipliers trade a saving for a miss. At 10 the rule was cheaper partly
because it missed its target on 3 of 5 folds of `Mohtat2020`. At 30 it meets the target but
pays for it.

## What the paper says now

The headline from this morning is withdrawn. The paper states the cross-chemistry result on the
four untuned parameter sets (&minus;4.50 cycles per design, interval &minus;8.50 to +0.25, which
spans zero) and reports the tuned cells as a sensitivity range whose sign depends on a plating rate
the programme chose. That is a weaker claim, and it is the one the data supports.

One more thing the run turned up, which is the next question: the forecast error roughly doubles
from multiplier 10 to 30, and the drift correction switches to a different observable. A
ten-cycle look may be too short once a cell fades fast, so the look length may have to scale with
fade.

Numbers: [`experiments/plating7s/results.txt`](../../research/cell-fidelity/experiments/plating7s/results.txt);
plan and outcome in the [log](../../research/cell-fidelity/LOG.md) (milestone 7s).
