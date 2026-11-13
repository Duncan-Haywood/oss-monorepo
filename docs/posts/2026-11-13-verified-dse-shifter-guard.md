---
title: "Chip design search: a one-line RTL check fixes our shifter failure, run blind"
seo_title: "An RTL shifter check keeps multi-fidelity chip design search honest"
date: 2026-11-13
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "An RTL check for data shifters of 64+ bits cut blind regret from 5.27% to 4.03% on three new circuit families, though it acted on only 3 of 12 cells."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences (Yosys, ABC and OpenROAD on SKY130). It asks
when a cheap score can stand in for a routed result. In the
[last step](2026-11-13-verified-dse-shifters-break-the-rule.md) our search
rule failed on a blind test. The rule ranks candidates by a clipped mapped
score and routes the best 8. On a 128-bit funnel shifter it cost 39 to 51%
regret, because the mapped delay of a shifter tells you nothing about its
routed delay.

This step asked whether a check of the source code could catch that before
anything is routed.

**The check.** Yosys elaborates the RTL, and we look for a word-level shift
whose data and shift amount are both signals. Two things that look like
shifts are left out: a decoder (`1 << s`) and a crossbar's indexed
part-select, which is only 2 to 8 bits wide. If the widest real shift is 64
bits or more, the rule routes random points instead of trusting the ladder.
The threshold of 64 was chosen on the 136 cells we had already run. There it
gives 1.08% mean regret against 1.67% without the guard. We also tried a
guard on the share of multiplexer gates. It did worse (1.30%), because
crossbars, where the ladder works well, use even more multiplexers than
barrel shifters do.

**The blind test.** Before any flow ran, we committed three families no
earlier table had touched, along with seven predictions:

- a rotate-and-mask unit (64 and 128 bits): a shifter;
- a leading-zero count with normalising shift (32 and 64 bits): a shifter;
- a maximum tree of 16 or 32 values: full of multiplexers, but no shifter, so
  it is a decoy.

That meant 1,440 flow runs, about 40 minutes on 4 cores.

| family | cells | rule without guard | rule with guard | equal-cost random |
|---|---|---|---|---|
| rotate-and-mask | 4 | 8.74% | 5.02% | 5.02% |
| leading-zero normaliser | 4 | 6.34% | 6.34% | 6.34% |
| maximum tree (decoy) | 4 | 0.73% | 0.73% | 2.99% |
| all 12 blind cells | 12 | 5.27% | 4.03% | 4.79% |

Six of the seven predictions held. Where the guard acts, the shifter failure
shows up again: on the 128-bit rotate-and-mask at the relaxed clock, the
unguarded rule has 22.9% regret against 9.7% for random routing. The decoy is
not flagged, stays on the ladder and wins.

**What failed.** We predicted that the across-design bootstrap interval of
(guard minus random) would sit below zero. It runs from -1.58 to +0.00 points.
The guard changes the decision in only 3 of the 12 cells. Both normaliser
designs are cheap to route, so the rule already routes randomly there and the
guard has nothing to do. The test was underpowered by construction. We should
have checked the cost ratio when we chose the designs.

**What this means for someone running a flow.** If your design has a wide
data shifter, do not trust a mapped-score ranking of synthesis recipes; route
a random sample instead. Otherwise, at a corner where routing costs more than
about 3 mapped scores, rank by the clipped mapped score and route the top 8.
The check reads RTL operators, so a shifter you built by hand from multiplexers
will slip past it. That blind spot is the next thing to test.

Code, data and the full table:
[`experiments/struct_guard/`](../../research/verified-dse/experiments/struct_guard/results.txt).
Produced with AI assistance (Claude Code); results are from one tool version,
one corner and global-route estimates.
