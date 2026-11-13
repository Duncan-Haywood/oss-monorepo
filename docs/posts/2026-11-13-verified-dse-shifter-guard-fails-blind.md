---
title: "Chip design search: our RTL shifter check fails its second blind test, and shows what the failure is"
seo_title: "Why a shift-operator check cannot guard chip design search"
date: 2026-11-13
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "A barrel shifter built from muxes slips past our RTL check and costs 18-20% regret; a 128-bit normaliser it flags is where the cheap ranking wins outright."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences (Yosys, ABC and OpenROAD on SKY130). It asks
when a cheap mapped score can stand in for a routed result. Our current rule
ranks candidates by a clipped mapped score and routes the best 8. It is known to
fail on shifters. In the [last step](2026-11-13-verified-dse-shifter-guard.md)
we added a guard: if the RTL has a word-level shift of 64 bits or more, route a
random sample instead. That guard held on a first blind test, but it changed the
decision in only 3 of 12 cells.

This step gave it a harder test. Before any flow ran, we committed six designs,
a second guard and seven predictions:

- leading-zero normalisers at 96 and 128 bits (flagged: they contain a wide
  shift);
- a floating-point alignment shifter with sticky bit at 64 and 128 bits
  (flagged);
- a barrel shifter written as explicit 2:1 mux stages, with no shift operator,
  at 64 and 128 bits. A SAT miter proves it equal to our ordinary barrel shifter,
  but the RTL check cannot see it.

The second guard, SWG, also flags designs whose generic-gate netlist is 75 to 90%
multiplexers. Seen barrels fall in that band; crossbars, where the ranking
works, sit above it. On the 148 cells we had already run, it gives exactly the
same answers as the first guard, so the old data could not choose between them.

That meant 1,440 flow runs, about 50 minutes on 4 cores.

| family | cells | rule, no guard | RTL guard | RTL + mux-share guard | equal-cost random |
|---|---|---|---|---|---|
| leading-zero normaliser | 4 | 1.76% | 7.56% | 7.56% | 7.56% |
| alignment shifter | 4 | 10.86% | 9.41% | 9.41% | 9.41% |
| mux-built barrel | 4 | 12.53% | 12.53% | 4.49% | 4.49% |
| all 12 blind cells | 12 | 8.38% | 9.84% | 7.16% | 7.16% |

Three predictions held and four failed.

**The blind spot is real.** On the 128-bit mux-built barrel the rule has 19.7%
and 17.9% regret, against 3.0% and 2.4% for random routing. The RTL check does
not flag it. The mux-share band does.

**The RTL check also flags the wrong thing.** On the 128-bit normaliser the
cheap ranking finds the routed-best recipe outright (0.00% regret at both
clocks), while random routing is at 11.4% and 11.8%. The guard throws that away.
Looking back over both blind tests (this part is after the fact), the ranking
reaches 0.00% on all 8 normaliser cells.

**What we now think the failure is.** In a barrel, funnel or rotate unit the
shift amount comes straight from an input, so the delay is mostly wires, which
the mapped score cannot see. In a normaliser the shift amount comes out of a
priority encoder. The critical path then runs through logic that the mapped
score does see. A shift operator in the source is not the problem, and neither
is a mux-heavy netlist on its own. The next guard we will test measures the
depth of the logic in front of the shift amount. We will choose it on the 160
cells we have and test it blind on a barrel whose amount comes from an adder.

**For someone running a flow today:** the safest rule we have is still to route
a random sample on barrel-like shifters. But a priority-encoded normaliser is
not barrel-like, and on it the cheap ranking wins.

Code, data and the full table:
[`experiments/shift_power/`](../../research/verified-dse/experiments/shift_power/results.txt).
Produced with AI assistance (Claude Code); results are from one tool version,
one corner and global-route estimates.
