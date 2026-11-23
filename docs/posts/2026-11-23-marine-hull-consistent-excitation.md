---
title: "Driving a strip-theory hull with its own diffraction force does not fix its drift force"
seo_title: "Strip theory exciting force from sectional diffraction: drift test"
date: 2026-11-23
tags: [research, marine-hull, seakeeping, added-resistance]
description: "We drove strip-theory motions with the force from each section's surge-conditioned diffraction flow. The phase error halved, but the free drift force got worse."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m survey boat loses in head seas. One of its estimates integrates second-order pressure over the hull, using strip theory's first-order flow. [The last step](2026-11-23-marine-hull-bow-reflection-strip.md) found one term that slender-body ordering drops from each section's body condition: the incident wave's surge velocity on the hull's longitudinal normal. Putting it back made a hull held fixed in waves reflect at the bow, and that fixed hull's drift force rose from a third of the 3D value to 0.73 to 0.90 of it. With the hull free, though, the result got worse. The step blamed the motions: they were still driven by strip theory's usual relative-motion exciting force, which knows nothing of the new term.

This step tested that explanation. The plan and seven expectations went into the [research log](../../research/marine-hull/LOG.md) (milestone 7zza) before any code was written. Five of the seven were refuted.

**What changed.** Each section's exciting force now comes from integrating its own pressure: the incident wave (Froude-Krylov, integrated on the panels) plus the diffraction potential solved with the surge-conditioned body condition. Heave force and pitch moment are summed along the hull and replace the right-hand side of the motion equations. A check variant feeds the old flow through the same integration and reproduces the relative-motion force to 0.14% or better, so the integration is sound. The 3D reference is Capytaine's panel solution on 2,560 panels per hull at zero speed.

| band λ/L 0.5 to 2.0, over the 3D | tank hull (L/B 6.67) | 4 m monohull (L/B 10) |
|---|---|---|
| exciting heave force, relative-motion | 1.100 | 1.068 |
| exciting heave force, own diffraction | 1.103 | 1.074 |
| free drift force, today's strip | 1.043 | 0.892 |
| free drift force, surge flow, old motions | 1.262 | 1.115 |
| free drift force, surge flow, own motions | **1.362** | **1.092** |

**The force's size hardly moves, but its phase does.** At λ/L 1 the strip-minus-panel phase of the heave force goes from −20.3° to −7.5° on the tank hull and from −10.5° to −5.6° on the monohull. In head waves the force is mostly Froude-Krylov plus the heave-like part of diffraction, so the new term turns the force more than it grows it. The motions move by 1% to 4%.

**The long-wave tail stays.** In long waves the 3D drift force goes to zero. Strip theory's stays slightly negative, and with the surge term it was four times more negative. With consistent motions it shrinks to 0.66 to 0.71 of that, still 1.8 to 2.1 times today's tail. At λ/L 4 the velocity term alone is −0.035 against the 3D's −0.00002 (units ρgζ²B²/L). The motions changed; the velocity term did not.

**What it means.** The last step's explanation was mostly wrong. The free-hull error lives in the surge-conditioned sectional flow itself, not in mismatched motions. The likeliest missing piece is the disturbance's own x-derivative in the body condition, which strip theory still drops. In 3D that is the part that lets the flow turn around the hull's ends. Until that is tested, the programme's speed comparison keeps today's strip near field, with this limitation stated.

**Limits.** Zero speed only, heave and pitch only, one strip grid and one 3D mesh. The panel motions are single-mode RAOs, so motion ratios mix model differences with heave-pitch coupling.

Reproduce it with `experiments/run_consistent_excitation.py` (about 11 minutes, Capytaine 3.0.0); the numbers are in [`results_consistent_excitation.txt`](../../research/marine-hull/experiments/results_consistent_excitation.txt).
