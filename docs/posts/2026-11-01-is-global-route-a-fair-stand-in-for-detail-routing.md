---
title: "Is global-route timing a fair stand-in for detail routing?"
date: 2026-11-01
tags: [research, chip-design, eda, verified-dse]
description: On five SKY130 designs, global-route ranking matches detail routing (tau 0.81 to 0.90, relaxed clock); tool versions shift rankings more than the router.
---

Chip-design search loops score candidates with a cheap, early result and trust
it to rank the same way a slower, more faithful flow would. In the
[verified-dse programme](../../research/verified-dse/README.md) the reference
is "global route plus timing repair". A fair objection is that real chips are
detail-routed. We reran five designs (50 ABC pass sequences each, 250 points)
through detailed routing and OpenRCX parasitic extraction at a clock 1.5x the
baseline period.

What came back, with OpenROAD 26Q3 and Yosys 0.70:

- Global-route ranking agrees with the detail-routed ranking: Kendall tau-b
  0.81 to 0.90 on all five designs. Its best pick costs 0.0% on four designs
  and 2.3% on the multiplier.
- The mapped-but-unplaced rung is the weak one: its pick is 10.1% off on the
  ALU and 9.2% off on the barrel shifter, which was 0.0% at the tight clock.
- Detail-route slack is a median 0.325 ns more optimistic than the
  global-route estimate, so absolute periods in the earlier tables are
  pessimistic. The ranking is what carries over.
- The tool version matters more than the router. The same points rerun under
  the newer tools correlate with the cached older-tool scores at tau 0.07 to
  0.66.

Limits: five small designs, one corner, and no predictions fixed before this
run, so read the numbers as descriptions. Details are in
`research/verified-dse/experiments/detail_route/results_relaxed.txt` and the
programme `LOG.md` (milestones 47 to 50).
