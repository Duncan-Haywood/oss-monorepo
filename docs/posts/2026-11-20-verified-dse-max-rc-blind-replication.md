---
title: "Worst-case wires, rerun blind: the chip-search ladder's edge still does not move"
seo_title: "SKY130 max-RC wires and a mapped-netlist shortlist, rerun blind"
date: 2026-11-20
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 15 more SKY130 designs run blind at ss with max-RC wires, the ladder's edge moved +0.23 points; over all 27 it moved +0.17 and still won 22."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) you can skip
by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps every ABC
pass sequence, then places and routes only the best eight by
`mapped area x max(period, 1.25 x mapped delay)`. It is scored against random
routing that costs the same wall-clock time.

Earlier today a run gave the slow corner (ss_100C_1v60) its own wire RC: SKY130's
max-RC corner, which raises resistance and capacitance per unit length by about
1.41 to 1.46 times on each metal layer (derived from the PDK's OpenRCX rule
files). Worst-case wires add delay the mapped netlist cannot see, so they looked
like the setting most likely to break the ladder. On the 12 designs that run
finished before its time limit, they did not: the ladder's edge moved +0.10
points. But the interval was wide (-1.44 to +1.84), and the primary test had no
power at 12 designs.

## The test

This run resumed the same flow on the 15 designs the first run never reached.
Their rows did not exist when the first result was written, so they are a blind
replication. Before the flow ran, seven predictions were committed. The primary
was that on the 15 the edge does not move: the 95% interval of the change
contains zero and the mean change is under 1.5 points.

Before the 3,505 new place-and-route points, a control re-ran 12 points of the
first design with the same nixpkgs build (Yosys 0.71, OpenROAD 26Q3). All 11
points that finished in both runs came back identical, to the last digit of
area and slack.

## What came back

All seven predictions held.

- **On the 15 fresh designs, max-RC wires moved the ladder's edge +0.23 points
  (interval -0.51 to +0.93).** No single design moved by more than 2.6 points.
- Mapped delay's rank agreement with routed delay (Kendall tau-b) moved -0.008
  (interval -0.025 to +0.007). That is the quantity earlier milestones tied to
  where the ladder loses.
- Routed delay grew against mapped delay on all 15 designs, by about 2%: the
  wires got worse, as they should.
- **Over all 27 designs, the edge moved +0.17 points (interval -0.61 to +1.01).**
  Under max-RC wires the ladder still beat equal-cost random routing on 22
  designs and lost on 5 (sign test p = 0.0015). At nominal RC it was 24 to 3.
- The ladder's mean regret was 1.38% at nominal RC and 1.56% at max RC. Random
  routing was 6.12% at both.

## What it means

At the slow corner, cell delay dominates even with worst-case wires on these
small blocks. A 45% rise in wire RC moves routed delay by about 2%, too little
to reorder which netlists route best. With 27 designs the interval on the change
is now under about a point either way, so "wire RC is not what moves the ladder"
is a measured null, not a guess from 12 designs.

The control matters too. Earlier milestones found today's tool build does not
reproduce last week's tables (tau-b 0.66 between them). With the same nix store
paths, the flow is deterministic. That drift comes from the rebuild, not from
run-to-run noise, so a two-build comparison on the same cells is the clean next
test.

## Limits

One corner, one placement density, 27 small designs. Wire delays are
global-route estimates with scaled layer RC, not a full parasitic extraction.
Vias stay at nominal resistance. The 15 fresh designs are the later part of a
fixed order, so they are not a random sample of the 27.

Code, tables and the per-design results:
[`experiments/rc_corner/results157.txt`](../../research/verified-dse/experiments/rc_corner/results157.txt);
the log entry is milestone 157 in
[`LOG.md`](../../research/verified-dse/LOG.md).
