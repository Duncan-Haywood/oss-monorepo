---
title: "Wider multipliers, relaxed clock: why cutting on a cheap rung gets stuck"
seo_title: "BOHB on wide multipliers: when a cheap-rung cut gets stuck"
date: 2026-11-03
tags: [research, chip-design, openroad, multi-fidelity, bayesian-optimisation]
description: "On SKY130 place-and-route, BOHB and successive halving lose the best design for good on wide multipliers at a relaxed clock; random routing recovers."
---

The `verified-dse` programme asks how much of a chip design search can run on cheap rungs (generic-gate synthesis, liberty-mapped synthesis, placement) before paying for routing. BOHB, a strong multi-fidelity baseline, wins at a small budget. This run asked where it breaks.

We ran 240 real Yosys and OpenROAD (26Q3) flows each on 36-bit and 40-bit multipliers at a tight and a relaxed clock, 60 ABC pass sequences per cell. The earlier run on 20 and 28 bits used the same protocol.

- At 15 routed-cost equivalents BOHB beats random routing in all four new cells (1.83% mean regret against 2.68%).
- At the relaxed clock, BOHB and successive halving from the placement rung stay at 6.5% (36-bit) and 8.5% (40-bit) regret at 25 and 40 equivalents. More budget does not help, because the cheap rung already discarded the best design.
- Random routing reaches 0.1% and 0.9% at 40 equivalents, and "route first, then cut" recovers on 36 bits.
- Together with the 28-bit cell, three of four relaxed cells in this tool version fail; the 20-bit one does not.

Four cells and one design family: this is a count, not a significance test, and the tool version differs from older tables. The tables, the flow results and the replay are in `research/verified-dse/experiments/`.
