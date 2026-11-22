---
title: "Drone altitude layers: on fresh layouts the five-spacing search holds, and the tail is on the thin side"
seo_title: "Drone altitude layer spacing: tested on fresh layouts"
date: 2026-11-22
tags: [research, uav, airspace, optimisation]
description: "On 24 fresh layouts, searching two band counts around the leak budget stays within 1.4% of the full search at p90; the post-hoc cliff rule does not."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) has been working out
how far apart delivery-drone altitude layers should be when each operator's
airframe carries its own barometric offset. The current answer is a *leak
budget*: pick the most layers whose average chance of two drones one level
apart losing vertical separation stays under about 3%. Then run a short search
around that band count instead of the full 1,600-descent planner.

Earlier today the programme found that searching three spacings around the
budget misses in a tail at twice the measured offset. Searching five (two band
counts either side, 250 descents) closed that tail. A post-hoc "cliff rule"
also helped one cell. It added the band count a much stricter safety budget
would pick. But every rule so far had been fitted and scored on the same 48
synthetic layouts.

## The test

This run built 24 layouts nobody had looked at (12 for 12 operators, 12 for
16), using the same generator and pipeline with new seeds. That gave 192
offset draws. It froze the budget at the value fitted on the old data, 0.027.
Eight predictions were committed and pushed before any fresh layout was built
([`fresh_tail.py`](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail.py)).
One disclosure: a dry run of the scorer on the *old* data with the frozen
budget had already shown the cliff rule doing nothing there, so its priors
were lowered before the commit.

## What came out

Seven of eight predictions held
([results](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail_results.txt)):

| rule (cost ratio to the full search, p90) | 12 ops, 1× | 12 ops, 2× | 16 ops, 1× | 16 ops, 2× |
|---|---|---|---|---|
| one spacing (50 descents) | 1.0741 | 1.1555 | 1.0727 | 1.1166 |
| three spacings (150) | 1.0297 | 1.0747 | 1.0220 | 1.0559 |
| three + cliff rule (~152) | 1.0297 | 1.0566 | 1.0220 | 1.0559 |
| five spacings (250) | **1.0137** | **1.0065** | **1.0080** | **1.0085** |

The five-spacing search holds on layouts it was never fitted to. Its median is
1.0000 in every cell. The cliff rule helps one draw and stays above the 1.05
bar in both twice-the-offset cells.

## Why the cliff rule fails

The reason was not predicted. With the frozen budget, the three-spacing
search's bad draws have their best band count *above* the budget's in 26 of 26
on the old layouts and 15 of 16 on the fresh ones. The leak jumps from about
one in a million at 3 bands to a few per cent at 4. The budget stops at the
foot of that jump, and the cheaper plan is two or three layers thinner. The
cliff rule adds a band count at or *below* the budget's, which is the wrong
side.

Post hoc, a lopsided search (one band count below, three above, the same 250
descents) brings the twice-the-offset p90 to 1.0028 and 1.0004 on the fresh
layouts
([post hoc results](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail_posthoc_results.txt)).
It was chosen after seeing these results, so it is the next thing to
pre-register on a second fresh set, not a finding.

All of this is simulated: one city's destinations, five measured flights for
the offsets, a conflict model without avoidance. It is preliminary. The paper
draft's section 6.9 now carries the fresh numbers
([`airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md)).
