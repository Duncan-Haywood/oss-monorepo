---
title: "Chip design search: a blind test on new circuit families breaks our rule, and shifters are why"
seo_title: "Multi-fidelity chip design search fails on funnel shifters, run blind"
date: 2026-11-13
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On six chip designs from three new families, run blind, our clipped search rule had 8.34% regret against 2.48% for random routing; a funnel shifter caused it."
---

The [verified-dse](../../research/verified-dse/) programme asks when it is
safe to trust a cheap score while searching over ABC logic-synthesis pass
sequences (Yosys, ABC and OpenROAD on SKY130). The rule we built over the last
seven steps works like this:

1. Time one routed point.
2. If routing costs more than three mapped scores, rank every point by mapped
   area x max(period, 1.25 x mapped delay) and route the best 8.
3. Otherwise, spend the same time routing random points.

[Last step](2026-11-12-verified-dse-what-the-blind-cells-say.md) counted the
rule only on cells run after its parameters were fixed. It beat random routing
in 18 of 24 cells, but across designs the interval still included zero, so we
asked for a bigger blind test.

This step ran that test. Before any flow ran, we committed six designs from
three families no earlier table had touched, along with eight predictions:

- funnel shifters (the rotate and double-word shift of CPU datapaths), 64 and
  128 bits;
- 8-tap constant-coefficient FIR sums, 12 and 16 bits;
- unrolled CORDIC rotation stages, 8 and 12 stages.

That meant 1,440 flow runs, about 40 minutes on 4 cores.

| family | cells | clipped rule regret | equal-cost random | rule better / worse |
|---|---|---|---|---|
| funnel shifter | 4 | 22.79% | 3.39% | 0 / 4 |
| CORDIC | 4 | 1.64% | 2.39% | 2 / 2 |
| FIR | 4 | 0.59% | 1.67% | 2 / 0 |
| all 12 blind cells | 12 | 8.34% | 2.48% | 4 / 6 |

Five of the eight predictions failed, including the headline one: the rule did
not beat random routing on the new families.

**One design carries most of it.** On the 128-bit funnel shifter, the point
that routes best ranks 70th of 103 on the mapped score, at both clock targets.
Mapped delay there is unrelated to routed delay (Kendall tau-b -0.16 and
-0.06). Mapped area still ranks routed area almost perfectly (0.99). A ladder
that routes the mapped top 8 cannot reach that point, so it costs 39 to 51%.
Clipping the score at the clock period, the fix that worked on multipliers,
hardly moves it. This is a different failure from the relaxed-clock one we
fixed before: here the wires decide the delay, and the mapped netlist cannot
see wires.

We also registered a guard: route 4 probe points, check whether the clipped or
the unclipped mapped score orders them better, and use that score. It halved
the funnel loss (14.1% against 22.8%), but that is still far above random
routing's 3.4%.

Pooled over every cell the clipped rule was tested on (36 cells, 18 designs):

- it beats random routing in 22 cells and loses in 11;
- on the mean it is behind, 3.85% against 2.77%, with a design-bootstrap
  interval of -1.68 to +5.55 points;
- it still clearly beats the same rule without the clip (better in 11 cells,
  worse in 1).

Leave out the two shifter families and the other 26 cells give 0.79%
against 2.59%. We chose that split after seeing the shifters fail twice, so it
suggests the next test rather than proving anything.

What a practitioner can take from this: a mapped-netlist score is a usable
screen for arithmetic logic (multipliers, squarers, FIR sums, larger CORDIC
chains). On barrel and funnel shifters, routing random points did better in
both of our blind tests. The next step is a structural check that needs no
routed point, such as the share of multiplexer cells in the mapped netlist. We
will fix it on the tables we already have, then test it blind on families
nothing has run.

Numbers: [`experiments/new_families/results.txt`](../../research/verified-dse/experiments/new_families/results.txt);
analysis: `python3 research/verified-dse/experiments/new_families/analyse.py` (under 20 s, reads the cached table; `run.py` re-runs the flow).
