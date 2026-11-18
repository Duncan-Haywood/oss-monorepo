---
title: "Chip design search: a second spot-check cuts false alarms threefold and still loses on the mean"
seo_title: "A confirmation probe for a chip flow search guard: 4.53% vs 4.39%"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 90 replayed Yosys and OpenROAD cells, confirming an alarm with a second random probe cuts false alarms from 12% to 4% but misses most true ones."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule ranks mapped candidates by a cheap clipped score and
pays for place-and-route only on the best 8. On some wide shifters that ranking
misleads, so a guard checks it: if one random routed candidate beats the best
of a random 32-candidate subset, stop trusting the ranking and route randomly.

The [last step](2026-11-15-verified-dse-hedged-fallback.md) showed that what
this guard pays for is its false alarms: on cells where the ranking is perfect
it fires in 12% of draws, and each time it throws away a perfect answer.

## Ask a second witness

The natural fix: when the check fires, route one more random candidate from the
subset (one the random fall-back would route first anyway, so it costs nothing
extra if the alarm stands) and fall back only if it too beats the ranked best.
We also tried demanding a margin (the random point must win by 0.5% to 5%).
The rule and six predictions went into the repository before the table was
computed (commit 1fe82756c), and the replay ran draw for draw against the
previous guard on the same 90 recorded cells.

## What happened

| rule | mean regret, 90 cells | where the ranking is perfect (40) | where it fails (17) | false / true alarm rate |
|---|---|---|---|---|
| no check | 4.77% | 0.00% | 16.63% | none |
| one spot-check | 4.39% | 1.15% | 11.83% | 12% / 34% |
| spot-check plus confirmation | 4.53% | 0.39% | 14.40% | 4% / 14% |
| spot-check with a 1% margin | 4.38% | 1.05% | 11.97% | 11% / 33% |
| 32-gate size rule | 3.91% | 1.35% | 8.82% | n/a |
| random | 5.44% | 6.56% | 4.25% | n/a |

The confirmation did what it was meant to do on the cells where the ranking is
fine: false alarms fell threefold and their cost fell from 1.15 to 0.39 points.
It is better than the single check on 47 cells and worse on 20. But it also
silenced most of the true alarms, and a true alarm on a failing cell is worth
about 12 points, twice what a false alarm costs. So the mean got worse. Two of
the six predictions were refuted: we expected the mean to improve and true
alarms to stay above 20%.

The reason is that the second witness knows little. Given that the first
random point beat the ranked best, a second one also beats it 42% of the time
on failing cells and 30% on perfect ones. That is weak evidence, so it cuts
true and false alarms nearly in proportion. The margin rule has the same
problem: from 0.5% to 5% the mean barely moves (4.38% to 4.42%).

## What it means

Four variants of this guard (plain, hedged, confirmed, margined) all land
between 4.37% and 4.63%, behind a plain structural rule (route the ladder only
below 32 gates in front of the shift amount) at 3.91%. Random probes are the
wrong instrument for asking whether the top of a ranking is wrong. The next
step is to stop tuning on cells we have already seen and test the best guard
and the structural rule blind, with real flow runs on new designs.

All numbers come from replaying recorded flow results (no new place-and-route
run) on cells earlier steps have already seen, so this prices the rule rather
than testing it blind. Code and table:
[`experiments/confirm_probe/`](../../research/verified-dse/experiments/confirm_probe/results.txt).
