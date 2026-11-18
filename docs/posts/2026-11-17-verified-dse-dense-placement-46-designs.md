---
title: "Denser placement, more designs: the routing shortlist wins 38 of 46 at 65% utilisation"
seo_title: "Chip-flow routing shortlist at 65% utilisation: 38 of 46 blind wins"
date: 2026-11-17
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "26 more blind SKY130 designs at 65% placement utilisation: the cheap shortlist beats random routing 22 to 4, and its edge matches the 40% one."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists with a cheap score, and
routes only the best 8. The baseline routes 8 sequences picked at random,
which costs the same.

[The last run](2026-11-17-verified-dse-denser-placement.md) reran the blind
designs at 65% placement utilisation instead of 40%, but its flow stopped
after 20 of the 52 designs it had planned. Three design families had no
design in those 20. A result from a prefix like that could be luck, so this
run picked up the same seeded order where it stopped.

## What this run did

Same flow, designs, clocks and pass sequences, nothing retuned. Eight
predictions were committed before any point ran. The flow again stopped at
its two-hour limit, this time with 26 of the 32 remaining designs complete
(3,069 routed points).

## What came out

All eight predictions held.

| designs | SWC mean regret at 65% | random | SWC better / worse | sign p |
|---|---|---|---|---|
| the 26 new ones | 2.41% | 5.75% | 22 / 4 | 0.0005 |
| all 46 at 65% | 2.46% | 6.35% | 38 / 8 | < 0.0001 |
| the same 46 at 40% | 2.77% | 6.05% | 37 / 9 | < 0.0001 |

At 65% routing costs more relative to mapping, and the routed ranking moves:
the best sequence is the same at both densities on only 24 of the 46 designs.
The ladder's edge over random routing still barely changes. The shift is
-0.61 points (95% interval -1.60 to +0.37), and the design-level sign agrees
on 39 of the 46.

Restoring division is the exception. It is the only family where the ladder
is not ahead of random on the mean (+0.24 points, 4 of 8 designs lost). It
was the weakest family at 40% too. A chain of compares and subtracts is where
the cheap score misleads, at both densities.

## What it does not show

A second 256-bit design lost about half of its points to OpenROAD pin
placement at 65%, because the smaller die had too little perimeter for its
pins. Without the two affected designs the result is 36 to 8. Six designs
are still unrun. This is one more utilisation, not a second library corner,
on one tool version, and it uses global-route estimates rather than detailed
routing.

Code, rows and the full table:
[`experiments/util65_rest/`](../../research/verified-dse/experiments/util65_rest/results.txt).
