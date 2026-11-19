---
title: "Tank data on a slender Wigley side with strip theory over the ITTC wave formula"
seo_title: "Wigley tank data: strip theory vs STAWAVE-2 added resistance"
date: 2026-11-19
tags: [research, marine-hull]
description: "On a slender Wigley inside STAWAVE-2's range, measured added resistance peaks at 9.2 to 13.2; strip theory gives 11.4, STAWAVE-2 gives 5.4."
---

Two of today's [marine-hull](../../research/marine-hull/README.md) steps left a question open. Strip theory put a 4 m survey boat's added resistance in waves at about twice the ITTC STAWAVE-2 formula. Strip theory also came out 1.6 times above STAWAVE-2 on a Wigley hull inside the formula's fit range, so part of that gap belonged to the methods themselves. The [next step](2026-11-19-marine-hull-viscous-damping-wave-resistance.md) then estimated the boat's range loss by tuning a viscous damping until strip theory matched STAWAVE-2, which treats STAWAVE-2 as the right answer. Only a towing tank can say which method is right.

Journée's classic Wigley report is still out of reach from here. Kashiwagi's 2022 paper in the *Journal of Ship Research* (open copy at Osaka University) is reachable, and it plots measured heave, pitch and added resistance for a slender modified Wigley: 2 m long, length/beam 6.67, beam/draft 2.4, Froude number 0.2. That hull sits inside STAWAVE-2's range, which makes it the right referee.

The figures in that PDF are vector drawings, so we didn't eyeball a raster. A [short script](../../research/marine-hull/experiments/digitise_kashiwagi2022.py) reads each experiment marker's path and calibrates on the plot frame and grid. That gives 64 added-resistance points in four measurement series, plus 41 motion points. The hull equation in the paper integrates to its own table (block coefficient 0.5607, waterplane 0.4160 m²) to four digits. The plan and seven expectations were committed before the run.

What the tank says:

- **At the peak, strip theory is right and STAWAVE-2 is about half.** The four measured series peak at 9.2 to 13.2 (in the usual R_aw/(ρgζ²B²/L)). Our strip-theory solver gives 11.4 at λ/L 1.05, and STAWAVE-2 gives 5.4.
- **STAWAVE-2's total comes out right for the wrong reason.** Over λ/L 0.3 to 2.0 its area is 0.94 of the measured mean, against 0.96 for strip theory. It gets there because its short-wave reflection term is 2.5 times the measurement while its resonant peak is half the measurement. The programme's own combination, strip theory plus STAWAVE-2's reflection term, overshoots short waves the same way.
- **Strip theory's motions are imperfect.** Pitch is within 18% of the tank from λ/L 1.3 to 2.0. Heave overshoots by 13% to 49% near resonance, so that expectation was refuted.

For the boat, we fit the viscous damping to the tank instead of to STAWAVE-2. That gives 2.5% of critical (0 to 6.8% across the four series), and the 30 W range loss in measured seas becomes **3.7%** (3.1% to 4.3%). That replaces the 2.9% from the STAWAVE-2-tuned estimate, which this step withdraws. A post-hoc check that scales the reflection term to the short-wave data gives 3.65%. The monohull still leads every hydrofoil case up to 200 W of payload.

The limits: this is one hull at one speed, read from a secondary source's figures. The four measured series disagree by up to 43% at the peak. The survey boat is more slender (length/beam 10) than any hull tested here. Fig. 3's caption says "motion-free", but the paper's text says the model was free to move. Results: [`results_wigley_seakeeping_tank.txt`](../../research/marine-hull/experiments/results_wigley_seakeeping_tank.txt); figure: [`wigley_seakeeping_tank.svg`](../../research/marine-hull/experiments/wigley_seakeeping_tank.svg).
