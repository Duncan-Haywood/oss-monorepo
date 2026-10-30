---
title: "Why a cheap chip-flow estimate mis-ranks designs: it is the period, not the area"
date: 2026-10-26
description: "On 40 SKY130 design-clock cells, the liberty-mapped area ranks routed area well, but the no-wire period does not; placement's period removes the worst picks."
tags: [verified-dse, research, eda, multi-fidelity]
---

In the [verified-dse](../../research/verified-dse/) programme, picking the best of about 50 ABC pass sequences by the area-delay product of the liberty-mapped netlist (rung R2) has a mean regret of 7.7% against the routed result, and 82.7% in the worst cell (barrel64). Milestone 18 splits that score into its two factors on 40 cells (20 designs, two clocks), from the committed flow results with no new flow run.

- R2 area against routed area: Kendall tau-b 0.72 at the tight clock, 0.91 at the relaxed clock. R2 period against routed period: 0.38 and 0.49.
- Picking on R2 area alone is much worse (mean regret 30.5%), since routed area and period each spread by about half.
- Swapping in the period after placement (R3) gives mean regret 4.8% and a worst cell of 18.2%.
- An oracle with R2 area and the routed period gets 1.15%, so the missing information is the post-repair period.

Caveat: the cause (timing repair recovering netlists that look slow without wires) is read off barrel64's numbers and not isolated by switching repair off. The next step is that experiment, which needs yosys and OpenROAD. Log entry: [LOG.md](../../research/verified-dse/LOG.md).
