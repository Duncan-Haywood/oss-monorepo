---
title: "Netlist naming noise is bigger across a whole table: five namings of six near-zero chip designs"
seo_title: "Netlist naming noise across a whole table: five namings"
date: 2026-11-24
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "Two fresh renamings of 720 SKY130 netlists: one naming moves a design's search edge up to 3.8 points, and edges under 4 points are ties."
---

[Yesterday's run](2026-11-23-verified-dse-naming-draws-per-design.md) on the
[verified-dse](../../research/verified-dse/) study set a rule for the paper:
a per-design result larger than about 3 points survives netlist naming
noise, and a smaller one is a tie. The rule came from 200 resampling draws
over three namings of every mapped netlist. Two of those namings were
constructed (Yosys's own and a canonical form), and the number of namings a
near-zero design would need was an extrapolation. So this run checked the
rule against namings it had not seen.

## The test

The six designs whose three-naming edge was under 3 points are gtc24r,
dot6r, gtc12r, clamp2r, dot4l and div12l. The edge is the clipped ladder's
regret minus that of equal-cost random routing, so negative means the ladder
wins. For each of those designs, every one of the 120 mapped netlists got
two fresh random renamings of its nets and instances. Each renaming was
placed and routed again with the same Yosys 0.71 and OpenROAD 26Q3 binaries
and the SKY130 ss_100C_1v60 library: 1,440 runs, 52 minutes on 4 cores.
Five predictions were committed before the flow ran.

## What happened

The primary prediction failed. It said at least 10 of the 12 fresh edges
would land within two of yesterday's per-point standard deviations of the
three-naming edge. Only 7 did:

| design | edge, 3 namings | fresh naming R2 | fresh naming R3 | edge, 5 namings |
|---|---|---|---|---|
| gtc24r | -0.42 | +0.07 | -4.16 | -1.24 |
| dot6r | -0.58 | -2.11 | -0.14 | -0.80 |
| gtc12r | -0.89 | -3.83 | -2.65 | -1.23 |
| clamp2r | +0.89 | +3.60 | +4.69 | +2.05 |
| dot4l | -2.08 | -3.95 | -3.69 | -1.00 |
| div12l | -2.98 | -2.74 | -0.59 | -1.89 |

The reason is how the noise enters. Yesterday's draws mixed namings point by
point, which is how a search meets the noise: each routed candidate is one
draw. A per-design table in a paper is different, because it is built from
one naming applied to every point at once. Those points move together. A
single whole-table renaming moved a design's edge by up to 3.8 points
(clamp2r, gtc24r). Five namings also gave a per-point spread 1.23 times the
three-naming one, so three namings had understated even the per-point noise.

The other four predictions held. Averaged over all five namings, the six
designs stay within 2.1 points of zero, and none of their signs changes from
the three-naming average. Averaging also works, but a little more slowly than
independent noise would allow: the spread from one naming is 2.03 times the
spread from three, against 2.45 under the 1/sqrt(k) law (with the
finite-population correction for drawing from five).

## What it changes

The paper's rule gets a second clause. A per-design difference under about 3
points is a tie when it comes from per-point draws, and one under about 4
points is a tie when it is read off a table built from one naming. clamp2r
is the only design where five namings push the ladder's loss (+2.05)
toward a size that would count. Two more namings there would settle it.
The headline is unchanged: averaged over three namings, the ladder still
beats equal-cost random routing by 4.37 points across all 27 designs.

Limits: the six designs were picked because their edge is near zero, so
their noise may not be typical. One of the five namings is constructed
rather than random. The results come from one corner and one utilisation,
with global-route estimates. The numbers are in
[`experiments/naming_more/results.txt`](../../research/verified-dse/experiments/naming_more/results.txt),
and the log entry is milestone 164 in
[`LOG.md`](../../research/verified-dse/LOG.md).
