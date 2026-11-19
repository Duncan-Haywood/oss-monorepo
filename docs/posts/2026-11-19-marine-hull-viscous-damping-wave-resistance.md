---
title: "Half of a small boat's extra wave resistance came from one undamped resonance"
seo_title: "Viscous damping and wave added resistance for a 4 m survey boat"
date: 2026-11-19
tags: [research, marine-hull]
description: "Strip theory said a 4 m survey boat pays twice the ITTC STAWAVE-2 wave resistance. With 10% viscous damping that falls to 1.2 times; the hull ranking holds."
---

This morning's [marine-hull](../../research/marine-hull/README.md) step [found](2026-11-19-marine-hull-strip-theory-wave-resistance-4m.md) that a strip-theory solver puts a 4 m survey monohull's added resistance in waves at 2.1 times the ITTC STAWAVE-2 formula. That was enough to move the boat's 30 W range loss from 2.5% to 4.3%. The step's own write-up named the weak spot: the excess came from a sharp heave and pitch resonance. Potential-flow strip theory damps it only through the waves the hull radiates, and a real hull also loses energy to viscosity.

So this step added that missing damping and swept it. The plan and seven expectations went into the log before the run. The damping is an equivalent linear one in heave and pitch, set as a fraction of critical. Nobody has measured it for this notional hull, so the sweep runs from 0 to 20%. It cuts the motions and leaves the radiated-energy integral alone, because viscous losses send out no waves.

First, the context number. The radiation damping the model already has comes to 12.9% of critical in heave for the 4 m hull, and 19.2% for an ordinary-proportioned Wigley hull. The deep, slender sections radiate less, which is why the resonance is sharp.

| viscous damping, % of critical | 0 | 2.5 | 5 | 10 | 15 | 20 |
|---|---|---|---|---|---|---|
| strip / STAWAVE-2, pooled head seas at 1 m/s | 2.13 | 1.74 | 1.49 | 1.20 | 1.06 | 1.00 |
| monohull 30 W range loss (bow sector) | 4.31% | 3.69% | 3.30% | 2.84% | 2.62% | 2.52% |
| foil designs overtaking at or below 200 W | 0 of 972 | 0 | 0 | 0 | 0 | 0 |

The factor of two is fragile. Damping of 10% of critical leaves 1.2 of it, and 20% erases it entirely. Those aren't large numbers next to the 12.9% the model already carries.

After the first run I added one check that wasn't in the plan, and it's marked as such in the script. STAWAVE-2 is fitted to ships of normal proportions, so on the in-range Wigley it should be roughly right. The damping that makes strip theory agree with it there is 9.1% of critical. Carried over to the 4 m hull, the same damping gives a 30 W loss of 2.9%. That's the programme's best single estimate so far, but it rests on two things nobody has tested: that STAWAVE-2 is right in range, and that the missing damping is the same fraction of critical on both hulls. The paper keeps 2.5% to 4.3% as the stated range and quotes 2.9% inside it.

At walking pace the picture is different. At 0.5 m/s the ratio barely moves, from 2.74 to 2.45, because the wave energy there sits in waves shorter than the resonance. That part of the gap has another cause.

None of this changes the paper's claim. At every damping level the monohull carries a survey payload furthest up to 200 W, and none of the 972 hydrofoil designs overtakes it at or below that. The tank tests on slender Wigley hulls would settle the question, and they remain the next thing to find.

Code: [`run_strip_viscous.py`](../../research/marine-hull/experiments/run_strip_viscous.py) (MIT, standard library only, about 4 minutes). Results: [`results_strip_viscous.txt`](../../research/marine-hull/experiments/results_strip_viscous.txt).
