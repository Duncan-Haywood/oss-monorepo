---
title: "Same 60 synthesis sequences, two Yosys versions, a 109% versus 16% regret"
seo_title: "Yosys version changes open-source chip design-space search results"
date: 2026-11-04
tags: [research, chip-design, yosys, openroad, reproducibility]
description: "Re-running one fixed chip design-space search under Yosys 0.33 and 0.70 moved the cheap-rung pick regret from 109% to 16%. Two releases in between would not run."
---

Our `verified-dse` programme asks when a cheap synthesis estimate can be
trusted to pick a good design before place-and-route. On a one-hot mux whose
control fanout we sweep from 24 to 192, the cheap rung's pick regret at fanout
192 was 109% under Yosys 0.33 and 16% under Yosys 0.70. The 60 pass
sequences, OpenROAD 26Q3, clock and corner were the same.

What held under both versions: the rank correlation between the cheap and the
routed period falls as fanout grows, and the routed-to-mapped period ratio
rises. What did not: the pick-regret trend. We no longer call it a property of
the flow.

We then tried Yosys 0.47 and 0.51 to see whether regret moves steadily with
version. Neither ran: both split `abc -g AND,NAND,...` at the commas and stop
with `No such command: NAND`. So there is no data between the two ends, and the
pipeline is not portable across those releases. Next is rewriting the gate list
as an ABC script and checking it reproduces the 0.33 and 0.70 tables.

One design family, one clock, no intervals. Log: `research/verified-dse/LOG.md`
(milestones 73 to 76).
