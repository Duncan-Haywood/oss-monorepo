---
title: "Strip theory's near-field drift force gets the right total from two wrong terms"
seo_title: "Strip vs 3D panel near-field drift: the velocity cross term"
date: 2026-11-23
tags: [research, marine-hull, seakeeping, added-resistance]
description: "Split term by term against a 3D panel solution, strip theory's velocity-squared drift term has a cross term of the wrong sign; dropping it makes things worse."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses in head seas. One of its two added-resistance estimates integrates the second-order pressure over the hull (Pinkster's near-field formula), using strip theory's flow: each cross-section gets a 2D disturbance potential driven by the local relative vertical velocity between hull and water.

[Yesterday's step](2026-11-22-marine-hull-3d-near-field.md) ran the same formula on a full 3D panel solution (Capytaine) at zero speed. The 3D version agreed with Maruo's far-field formula to half a percent, and it showed that the strip version's small negative tail in long waves sat entirely in the velocity-squared term. The open question was which part of that term.

So this step split the term into its three pairs: incident-wave velocity squared, the cross term between incident and disturbance velocities, and disturbance velocity squared, each by x, y and z component. We ran it on both hulls in 3D and in strip theory. The seven expectations were committed to the [research log](../../research/marine-hull/LOG.md) (milestone 7zy) before the code was written.

**The cross term is the fault.** Units below are ρgζ²B²/L, the 4 m monohull at zero speed:

| λ/L | 3D cross term | strip cross term | 3D disturbance² | strip disturbance² |
|---|---|---|---|---|
| 0.5 | −1.234 | +0.139 | +0.332 | +0.075 |
| 1.0 | −0.019 | +0.522 | −0.021 | −0.017 |
| 4.0 | −0.00004 | −0.00995 | +0.00006 | −0.00003 |

The incident-squared part is zero to rounding in both models, as it must be for a closed hull. The disturbance-squared parts agree from λ/L 0.7 up. The cross term carries 99% of the strip's long-wave tail and has the wrong sign through the middle of the band. Most of that error is in the surge component: the wave's horizontal velocity times the strip model's along-hull disturbance velocity.

**Removing the cross term does not fix it.** In 3D the cross term is large and negative in short waves, about as big as the whole drift force at λ/L 0.5. Dropping the strip's version leaves only 0.14 (monohull) to 0.32 (tank hull) of the 3D area over λ/L 0.5 to 2.0. The unmodified strip near field lands at 0.89 to 1.04 of it. So the strip near field gets the band total roughly right because two wrong terms cancel: yesterday's waterline term is 30% to 40% too small, and this cross term has the wrong sign.

Before reading this as physics we checked the obvious slip, a time-convention sign error. The Frank section potentials pass the energy-balance check with positive damping at every frequency, and the disturbance-squared part, which ignores phase, matches the 3D. What is wrong is the phase of the sectional disturbance relative to the incident wave along the hull. The relative-velocity shortcut sets that phase from the local vertical velocity alone.

For the boat itself nothing changes this step. The tail is about 0.25% of the peak, and earlier steps found the monohull's 30 W loss insensitive to it. What it does change is how much weight the paper can put on the strip near field as an independent check: its agreement is partly luck. The next step solves each section's diffraction problem with the incident wave's own boundary condition, instead of the relative-velocity shortcut, and checks whether that gets the cross term's sign back.

Code and numbers: `research/marine-hull/experiments/run_velocity_split.py` and `results_velocity_split.txt`, about 7 minutes on a laptop-class CPU. Capytaine 3.0.0 does the 3D solve.
