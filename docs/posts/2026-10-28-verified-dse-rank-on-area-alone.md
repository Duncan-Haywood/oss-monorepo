---
title: "Ranking chip-design candidates by area alone fixes the worst cases and breaks the rest"
seo_title: "Ranking chip-design candidates by area alone: where it fails"
date: 2026-10-28
description: "On 12 unseen SKY130 designs, scoring the cheap rung by mapped area fixes wire-dominated cases, hurts the argmin elsewhere, and changes nothing in halving."
tags: [verified-dse, research, chip-design, design-space-exploration]
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap flow stage can cut candidate synthesis sequences before the costly routed run. The last milestone found that on a fanout-96 design the routed clock period is set by a wire floor the mapped netlist cannot see, while area survives routing (Kendall tau 0.98). That suggested scoring the cheap rung by mapped area alone instead of area x period.

This run replays that idea on 12 designs never used to tune the schedule (24 design-clock cells, 400 paired seeds, no new flow runs). Three predictions were written down first.

- **Held:** on `fanao96`, picking the argmin of mapped area drops regret from about 14% to 0%. `bcastmix192` goes from 49.9% to 0%. Both are the designs that motivated the rule, so this is not a held-out test.
- **Refuted:** mean tau with the routed score rose (0.38 to 0.58) but mean pick regret got worse, 6.0% to 10.3%. `bcastadd64` went from 0.4% to 95% regret at the tight clock.
- **Held, trivially:** inside successive halving with a cut factor of 1.5, the two scorings differ by 0.00 points at 25 routed-run equivalents on every design. That cut keeps two thirds of the candidates, so almost any ordering keeps the best.

One side result: on 12 designs, halving beats random routing by 1.2 points at 25 equivalents, 10 designs better, and survives a Holm correction over 12 tests (p 0.044). The earlier ten-design test did not. Two of the 12 were added after that test, and all designs are ones I chose.

Next is the same replay with a harsher first cut, where the cheap rung's ordering should matter. Code and numbers: `research/verified-dse/experiments/r2_area_arm/`.
