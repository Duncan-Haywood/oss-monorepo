---
title: "Strip theory against a 3D panel code: wrong coefficients, right motions"
seo_title: "Strip theory vs Capytaine 3D panels on a Wigley hull"
date: 2026-11-20
tags: [research, marine-hull]
description: "On two Wigley hulls, strip theory's heave added mass is 19-27% below a 3D panel code's, yet the motions and added resistance agree within 1-6%."
---

Every wave-loss number in the [marine-hull](../../research/marine-hull/README.md) programme since milestone 7z comes from one solver written for the programme: 2D Frank close-fit sections, ordinary strip theory for heave and pitch, and the Gerritsma-Beukelman radiated-energy formula for added resistance. Strip theory treats each slice of the hull as if it were part of an infinitely long cylinder, so it ignores the flow along the hull. For the 4 m survey monohull (length/beam 10) the open question has been whether that matters. The usual test is Journée's L/B 10 tank data, and this session could not reach any data host to get it.

A 3D panel code needs no data host. [Capytaine](https://github.com/capytaine/capytaine) is an open-source boundary-element solver: it puts sources on about 2,500 panels on the hull's own surface and solves the radiation and diffraction problems with the free-surface Green function. We ran it at zero forward speed on the Kashiwagi tank hull (L/B 6.67) and the 4 m monohull, with the same mass, inertia and restoring as the strip model, so only the hydrodynamics differ.

**The code check passes.** On a very slender Wigley (L/B 30), where strip theory should be close to exact, the two codes agree to within 0.9% in heave added mass and damping. The panel results also move by at most 1.4% between 640 and 2,560 panels.

**The coefficients disagree, and in the direction we did not predict.** Over wavelengths of 0.5 to 2 hull lengths, strip theory's heave added mass is 19% (tank hull) and 27% (monohull) *below* the 3D value. We had written down, before the run, that it would be above. 2D heave added mass grows like the logarithm of one over the frequency, and in 3D the hull's length takes over as the cut-off once the waves are about as long as the hull. Pitch damping goes the other way, up to five times the 3D value in long waves.

**The motions agree anyway.** Fed into the same equations of motion, the two sets of coefficients give heave responses whose areas agree to 0.2% and pitch responses within 5% (tank hull) and 1% (monohull). In long waves the response is set by the restoring force and the wave force, which both codes get nearly right. With the 3D motions, the Gerritsma-Beukelman added resistance comes out 1.055 times the strip value on the tank hull and 1.009 times on the monohull.

That matters because the motion term carries almost all of the monohull's wave loss: 2.84 of 2.87 N at 1 m/s on one side of the programme's 3.4% to 4.2% bracket. At zero speed, strip theory's missing flow along the hull moves that term by about 1%.

What this does not show: anything at forward speed, where strip theory's speed terms act and where the tank data were taken (Froude number 0.2). It also does not test the Gerritsma-Beukelman formula itself, which used the strip sections on both sides. Five of the eight expectations committed before the run held. The script is [`run_panel_check.py`](../../research/marine-hull/experiments/run_panel_check.py) and it takes under 3 minutes; the outputs are in [`results_panel_check.txt`](../../research/marine-hull/experiments/results_panel_check.txt).
