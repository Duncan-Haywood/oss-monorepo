---
title: "Two 3D wave-drift formulas agree to half a percent; the strip version's long-wave error is one term"
seo_title: "3D near-field vs far-field added resistance on a Wigley hull"
date: 2026-11-22
tags: [research, marine-hull, seakeeping, added-resistance, capytaine]
description: "Pinkster's near field on Capytaine panels matches Maruo's far field within 0.5% on two Wigley hulls, and locates the strip near field's long-wave error."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses to waves. The wave loss comes from the added resistance in waves, and the programme computes it with several formulas. Those formulas disagree, so it needs a reference to check them against.

At zero speed that reference was Maruo's far-field formula. It works from the waves that a 3D panel solution (Capytaine) radiates away from the hull. This step added a second, independent estimate on the same panel solution: Pinkster's near-field pressure integration. That means adding up four second-order pressure terms over the hull itself: the band between mean and actual waterline, the squared fluid velocity, the first-order pressure at the hull's displaced position, and the tilt of the first-order force. For a converged 3D solution the two must agree. The eight expectations were written into the [research log](../../research/marine-hull/LOG.md) (milestone 7zx) before the code.

**They agree.** Over wavelengths of 0.5 to 2 hull lengths, the near-field area is 1.0054 times Maruo's on Kashiwagi's tank hull and 1.0049 on the 4 m monohull, with the hull free to heave and pitch (1.0125 and 1.0072 held fixed). A fixed vertical cylinder, which has an exact answer, comes out within 2.1% of it. Going from the 640-panel mesh to the 2,560-panel one moves both formulas by 1.3% to 2.1%. So the near field converged as fast as the far field here, which refuted the one expectation we got wrong. Every earlier zero-speed comparison in the programme was made against Maruo, so this one check confirms all of them. Gerritsma-Beukelman is still 2.3 to 2.8 times the 3D answer at zero speed.

**The 3D near field has no long-wave tail.** In waves four to eight hull lengths long, the free hull just rides the wave and the 3D near field falls to under 0.07% of its peak. It stays positive and follows Maruo down. The strip-theory near field does not: three earlier steps found a small negative tail that survived every grid and both damping forms. Here it shows up again at zero speed with no damping at all (-0.0031 in the programme's sigma units at eight hull lengths).

| lambda/L 8, monohull, zero speed | waterline | velocity | pressure gradient | rotation |
|---|---|---|---|---|
| 3D panel | -0.00000 | -0.00000 | 0.00007 | -0.00003 |
| strip | 0.00005 | **-0.00319** | 0.00003 | 0.00001 |

The whole tail is in one term. In 3D, the cross term between the incident wave's velocity and the hull's disturbance velocity cancels around the hull. In strip theory the disturbance is solved one section at a time, so that cancellation never happens.

**The bigger lesson is in the middle of the band.** At one hull length the strip near field's total is 1.2 times the 3D one. That is not bad, but its terms get there by luck: its velocity term is +0.50 where the 3D term is -0.04 to -0.07, and its waterline term is 0.51 to 0.63 against 0.84 to 0.99. Running the formula term by term on strip flow does not make it a 3D formula.

**What this does and doesn't change.** The monohull's wave loss doesn't move. The tail is about 0.25% of the strip peak, and earlier steps already put the bracket at 3.4% to 4.2% of range. What changes is the paper's footing: the zero-speed reference now rests on two independent 3D formulas. And there is a concrete target for making the strip near field consistent: the velocity cross term.

Limits: zero speed only, constant-strength panels, waterline elevation extrapolated from the top two panel rows, and no viscous damping. Each model uses its own motions, which are within 3% of each other at the compared points. Code: `src/marine_hull/panel_nearfield.py`; results: `experiments/results_panel_nearfield.txt`.
