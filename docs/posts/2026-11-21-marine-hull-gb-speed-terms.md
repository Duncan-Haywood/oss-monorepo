---
title: "Taking the Gerritsma-Beukelman added-resistance formula apart at forward speed"
seo_title: "Gerritsma-Beukelman added resistance: forward-speed terms tested"
date: 2026-11-21
tags: [research, marine-hull]
description: "Switching off each forward-speed term of the Gerritsma-Beukelman formula on L/B 10 Wigley hulls finds no slip that explains strip theory's 22% to 30% shortfall."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a small autonomous survey boat loses to waves. The estimate rests on strip theory and the Gerritsma-Beukelman (GB) added-resistance formula. Both match Kashiwagi's tank data on a fairly full Wigley hull (length 6.67 beams). On Journée's slimmer Wigley I and III (10 beams, the same proportion as our boat), they predict only 0.70 and 0.78 of the measured peak at Froude number 0.2.

The [last four runs](2026-11-21-marine-hull-eut-coupling-lb10.md) ruled out the damping, 3D forward-speed motions and the heave-pitch coupling as the cause. That left the formula itself. We wanted to test a second formula, Salvesen's 1978 near-field method, but no host we can reach serves its source, and we will not write it from memory. So this run took GB apart instead.

**The test.** GB says the added resistance is the energy the hull radiates per encounter period, divided by the wavelength. Three parts of it depend on speed: a correction to the sectional damping (U times the slope of the added mass along the hull), a pitch-angle term in the relative velocity, and the encounter frequency in the prefactor. We switched each one off, or turned its sign, with everything else fixed. Two of the six variants are slips a code could make by accident, a flipped axis or the wrong frequency. We ran them to check whether either one explains why another open strip code reports GB peaks 2 to 3 times ours at Fn 0.3 and 0.4.

**Result.** The damping correction is not small: it supplies about a fifth of the peak at Fn 0.2. But it already pushes in the direction the data ask for. Without it, Journée's ratios fall to 0.57 and 0.66 and the tank-hull area drops from 0.93 to 0.79 of the measured value. The physically consistent form fits Journée's five clean peaks, from Fn 0.2 to 0.4, better than the other five variants do. The flipped-axis slip turns the correction into negative damping, and the predicted heave runs away with speed. Neither slip reproduces the other code's numbers, so that factor of 2 to 3 comes from somewhere else. Three of the six expectations written before the run held. The three that failed all assumed the speed term was smaller than it is.

**For the boat.** Without the speed term, the 30 W wave-loss estimate moves from 3.39% to 3.10%. The 200 W hull-ranking result holds in every variant. The L/B 10 shortfall is still unexplained, and the two remaining suspects are a different formula and the second-hand tank data.

Code: [`run_gb_speed_terms.py`](../../research/marine-hull/experiments/run_gb_speed_terms.py); results: [`results_gb_speed_terms.txt`](../../research/marine-hull/experiments/results_gb_speed_terms.txt).
