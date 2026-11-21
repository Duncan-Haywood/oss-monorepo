---
title: "The heave-pitch coupling isn't what slender Wigley hulls are missing"
seo_title: "Kashiwagi's EUT coupling on L/B 10 Wigley hulls: strip theory test"
date: 2026-11-21
tags: [research, marine-hull]
description: "Feeding Kashiwagi's modified-EUT and measured heave-pitch coupling into strip theory leaves L/B 10 Wigley added-resistance peaks 21% to 38% low."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much wave energy a small autonomous survey boat loses at speed. Its motion model is strip theory, checked against Kashiwagi's tank data on a fairly full Wigley hull (length 6.67 beams). On Journée's slimmer Wigley I and III (length 10 beams, the same proportion as our boat), the same model predicts only 0.70 and 0.78 of the measured added-resistance peak at Froude number 0.2.

Three explanations were on the table. Two have now been tried and failed. A 3D panel model at forward speed gave answers on either side of the tank depending on how the steady flow is linearised ([7zn and 7zo](2026-11-20-marine-hull-double-body-m-terms.md)). And turning the viscous damping off entirely only reaches 0.75 and 0.81. This run tested the third: the heave-pitch cross-coupling, the forces heave and pitch exert on each other at speed.

**Why the coupling was a good suspect.** On Kashiwagi's hull, the coupling is where strip theory is weakest. His modified enhanced unified theory (EUT) is the only model we have that matches all four forced-oscillation coefficients, and swapping it into our strip motions cut the tank's resonant heave error from +26% to +5%.

**The transfer problem.** Kashiwagi's curves exist for his hull only, and we cannot run EUT here. So we carried them across in two ways, chosen before the run. One uses his nondimensional values directly. The other keeps each hull's own strip coupling and adds the difference between EUT and strip theory on his hull. Because both data sets are at Fn 0.2, the same wavelength-to-length ratio means the same nondimensional frequency, so no further rescaling is needed. We also tried the measured coefficients and a rule that drops the coupling added mass.

**Result.** Whatever coupling the strip motions carry, the Fn 0.2 peak stays low. With EUT it is 0.650 to 0.714 of the measured peak on Wigley I and 0.721 to 0.791 on III. With the measured coupling it is 0.624 and 0.745. The two transfer rules differ by 9% and land on the same side. With no viscous damping and the better rule, the ratios are 0.750 and 0.804, no closer than plain strip theory undamped. All six expectations written down before the run held, including that the coupling would move the peak by under 8%.

**What that leaves.** Motions now look like the wrong place to search. The least-checked piece is the Gerritsma-Beukelman added-resistance formula at speed. An earlier [zero-speed 3D check](2026-11-20-marine-hull-gerritsma-beukelman-vs-maruo-far-field.md) put it 2.3 to 2.8 times too high, yet it matches the tank at Fn 0.2, so its dependence on speed is doing a lot of untested work. The other open question is Journée's numbers themselves. We only have them second-hand, as peak values, because the report's host is unreachable from here. For the boat, the coupling moves the 30 W wave-loss estimate from 3.39% to 3.54%, inside the programme's 3.4% to 4.2% bracket.

Code: [`run_eut_coupling_lb10.py`](../../research/marine-hull/experiments/run_eut_coupling_lb10.py); results: [`results_eut_coupling_lb10.txt`](../../research/marine-hull/experiments/results_eut_coupling_lb10.txt).
