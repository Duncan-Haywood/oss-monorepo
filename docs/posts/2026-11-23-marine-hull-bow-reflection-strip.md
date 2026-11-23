---
title: "Strip theory's restrained hull cannot reflect a wave at the bow, and one dropped term is why"
seo_title: "Strip theory diffraction: the dropped surge term and bow reflection"
date: 2026-11-23
tags: [research, marine-hull, seakeeping, added-resistance]
description: "Held fixed in head waves, a strip-theory hull's waterline drift term is exactly zero. Restoring one body-condition term recovers most of the 3D drift force."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m survey boat loses in head seas. One estimate integrates the second-order pressure over the hull, using strip theory's flow. [The last step](2026-11-23-marine-hull-velocity-cross-term.md) found that this flow gets the total roughly right from two wrong terms. The worse of the two is the cross term between incident and disturbance velocities, which has the wrong sign.

This step asked where the sign error comes from. The plan and seven expectations went into the [research log](../../research/marine-hull/LOG.md) (milestone 7zz) before any code was written. Four of the seven were refuted.

**First, hold the hull still.** Then there are no motions, the disturbance is pure diffraction, and both the strip and the 3D panel model (Capytaine) solve the same problem. At λ/L 1 the strip cross term is +0.23 (tank hull) and +0.25 (4 m monohull), against −0.40 and −0.42 in 3D (units ρgζ²B²/L). So the error is in the diffraction flow, not in the motions.

**Second, a zero that is not a coincidence.** For the restrained hull, strip theory's waterline term is exactly 0.00000 at every wavelength on both hulls. In 3D the same term is 0.98 to 1.63 in the band, the largest single part of the drift force. The reason is structural. Strip theory gives each section the incident wave's vertical velocity as its body condition, so sections at mirrored stations fore and aft see waves of the same amplitude with different phase. The squared pressure is then fore-aft symmetric, and weighted by the waterline's longitudinal normal it cancels. A flow like that cannot reflect a wave off the bow, and bow reflection is most of a fixed hull's drift.

**Third, put the dropped term back.** The 3D body condition also contains the incident wave's surge velocity times the hull's longitudinal normal, n_x ∂φ_I/∂x. Slender-body ordering drops it. We solved each Frank section directly with two variants of the condition, depth decay alone and depth decay plus the surge term:

| restrained, area over λ/L 0.5 to 2.0, over the 3D | tank hull | 4 m monohull |
|---|---|---|
| today's strip flow | 0.406 | 0.332 |
| + incident depth decay e^{kz} | 0.411 | 0.339 |
| + surge term on n_x | **0.895** | **0.732** |

The depth decay does nothing. It moves the cross term by under 1% of the gap. The surge term more than doubles the restrained drift and closes most of the cross-term error. On the tank hull it also gives the 3D sign; on the monohull it does not.

**Fourth, the honest catch.** Let the hull move with today's strip motions and the surge term makes things worse. The band areas become 1.26 and 1.12 of the 3D, against 1.04 and 0.89 before, and the small negative long-wave tail grows four times. The motions are driven by strip theory's relative-motion exciting force, which knows nothing of the surge term. So in long waves the hull follows the wave, but the new flow keeps a disturbance it should have lost. Flow and motions have to change together. The next step computes the strip motions' exciting force from the same sectional diffraction pressure.

None of this changes the paper's 3.4% to 4.2% range-loss bracket, which rests on Gerritsma-Beukelman. What it changes is the account of why strip theory's near-field drift is off. The flaw is a known slender-body omission, now measured term by term against a 3D solution, not a mystery in the formula. Code: [`run_sectional_diffraction.py`](../../research/marine-hull/experiments/run_sectional_diffraction.py), results: [`results_sectional_diffraction.txt`](../../research/marine-hull/experiments/results_sectional_diffraction.txt).
