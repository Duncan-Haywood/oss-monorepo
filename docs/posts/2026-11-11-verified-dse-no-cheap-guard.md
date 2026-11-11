---
title: "Chip design search: a guard that worked in-sample and failed on fresh data"
seo_title: "Pre-registered guard for multi-fidelity chip search fails on new data"
date: 2026-11-11
tags: [research, chip-design, verified-dse, open-source, negative-result]
description: "A guard read from the mapped netlist caught all five failing multiplier cells it was chosen on, then missed both fresh ones; regret rose from 0.97% to 1.16%."
---

The [verified-dse](../../research/verified-dse/) programme now has a simple
rule for searching open-source chip flows (Yosys, ABC and OpenROAD on
SKY130). Time one design point. If routing a point costs more than 3 times
scoring its mapped netlist, score every candidate at the mapped rung and route
only the best 8. Otherwise, route randomly chosen candidates for the same
wall-clock. Three tests on fresh data back it. It has one known failure:
multipliers at a relaxed clock, where the mapped ranking points to the wrong 8
(10.5% regret on an 18-bit multiplier last time).

This step asked whether that failure can be spotted for free. The rule
already scores every candidate at the mapped rung, so any statistic of those
scores costs nothing. Two looked promising on the 52 held-out cells:

- **Slack:** the median mapped slack as a share of the clock period.
- **Spread:** how much the mapped delay varies across ABC pass sequences.

The failing multipliers have both a large slack and a wide spread.

The test was set up in advance. We picked the guard from 34 thresholds on the
held-out cells, and committed it and six predictions before running it on 48
cells whose statistics nobody had computed.

- **In-sample it looked perfect.** The chosen guard (slack at least 0.15 and
  spread at least 0.3) flagged exactly the five failing relaxed multipliers
  and nothing else. Mean regret fell from 1.66% to 1.15%, or 1.25% with
  whole design families held out.
- **Out of sample it failed.** On 28 fresh cells where routing is expensive,
  it missed both relaxed multipliers. It also flagged a broadcast adder the
  ladder handles perfectly. Mean regret rose from 0.97% to 1.16%. Three of the
  six predictions failed, among them the two that mattered: lower test regret
  and catching the two failures.
- **Why it failed.** Six designs appear in both the held-out and the fresh
  tables, so we compared them. Slack is a property of the design and the
  clock: it moved by at most 0.10 between tables. Spread is a property of
  whichever pass sequences you happen to run: it changed by 11 to 35%. The
  statistic that separated the failures was an accident of the sample. The
  statistic that is stable does not separate them: 16 and 22-bit multipliers,
  a squarer and a GF(2) matrix at a relaxed clock have the same slack as the
  failing cells, and the ladder handles them.
- **Even hindsight barely helps.** The best of the 34 guards, chosen on the
  test cells themselves, gains 0.08 points. It flags 7 cells to catch the 2
  real failures.

So the rule stays as it was, and its failure is now a documented limit: a
relaxed-clock multiplier can mislead the mapped rung in a way the mapped rung
cannot reveal. The next step is to look one rung later. Placement scores on
the 8 kept points cost little inside the ladder's budget, and may show what
the mapped scores cannot.

Code, predictions and every number:
[`experiments/r2_guard/`](../../research/verified-dse/experiments/r2_guard/results.txt).
The pre-registration commit is in the
[research log](../../research/verified-dse/LOG.md).
