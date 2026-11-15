---
title: "Chip design search: hedging a failed spot-check barely helps, because the check is the problem"
seo_title: "Hedging a ranking's fall-back in a chip flow search: a 0.02-point gain"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 90 replayed Yosys and OpenROAD cells, keeping three ranked candidates when a spot-check fails moves mean regret only from 4.39% to 4.37%."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule ranks mapped candidates by a cheap clipped score and
pays for place-and-route only on the best 8. On some wide shifters that ranking
misleads.

The [last step](2026-11-15-verified-dse-pilot-probe-guard.md) added a free
spot-check: compare the best of a random 32 mapped candidates against the one
random candidate the rule already routes to time the flow. If the random one
wins, stop trusting the ranking and route randomly. That beat the unguarded
rule on mean regret (4.39% against 4.77%), but on cells where the ranking was
perfect, the check fired falsely in about 12% of draws and cost 1.15 points.

## Hedge instead of abandon

The obvious fix is to soften the response: when the check fails, still route
the subset's next three ranked candidates, then go random with the rest. Those
three are already mapped, so they cost three random routes out of about 30. We
wrote the rule and six predictions into the repository before computing the
table (commit a1f0fd90a), and replayed it on the same 90 cells, draw for draw
against the previous rule.

## What happened

| rule | mean regret, 90 cells | where the ranking is perfect (40) | where it fails (17) |
|---|---|---|---|
| no check | 4.77% | 0.00% | 16.63% |
| spot-check, random fall-back | 4.39% | 1.15% | 11.83% |
| spot-check, hedged fall-back | 4.37% | 1.11% | 11.79% |
| spot-check, map all then hedge with global ranks | 4.69% | 0.53% | 14.94% |
| 32-gate size rule | 3.91% | 1.35% | 8.82% |
| random | 5.44% | 6.56% | 4.25% |

All six predictions held, and the gain is 0.02 points (interval -0.04 to
-0.01). It is better on 24 cells and worse on 1, but it barely moves anything.
The reason is in the subset: on a false alarm, the subset's next three ranks
hold the cell's best candidate only 19% of the time, because 32 random
candidates rarely include the global winner. The hedge that could recover it
uses global ranks, which means mapping everything first. That halves the
false-alarm cost but leaves too little budget for the random fall-back on the
cells where the ranking really fails.

## What it means

The fall-back is not where the loss comes from. To get past the simple 32-gate
rule, this check has to raise fewer false alarms in the first place: a margin
on how badly the random point must beat the ranked one, or a second probe pair.
That is the next step, priced by replay first, then tested blind with real flow
runs on new designs.

All numbers are from replaying recorded flow results (no new place-and-route
run), on cells earlier steps have already seen, so this prices the rule rather
than testing it blind. Code and table:
[`experiments/hedge_probe/`](../../research/verified-dse/experiments/hedge_probe/results.txt).
