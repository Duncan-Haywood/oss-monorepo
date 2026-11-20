---
title: "A 3D panel code at forward speed: better on one Wigley hull, worse on the other"
seo_title: "Capytaine forward speed vs strip theory on Wigley hulls"
date: 2026-11-20
tags: [research, marine-hull]
description: "Capytaine's forward-speed option overshoots measured heave by 36% on one Wigley hull at Fn 0.2 and narrows the gap on two L/B 10 hulls; the bracket stands."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much head waves cost a 4 m autonomous survey boat. Its motions come from a strip theory: the hull is cut into 2D slices. Two earlier steps compared that theory with a 3D panel code at zero speed: [the motions agreed](2026-11-20-marine-hull-strip-theory-vs-3d-panel-code.md), and [the added-resistance formula did not](2026-11-20-marine-hull-gerritsma-beukelman-vs-maruo-far-field.md). Both said the next test was forward speed, because the boat and every tank measurement are moving.

The open-source panel code [Capytaine](https://github.com/capytaine/capytaine) (3.0.0) has a forward-speed option. It solves the zero-speed problem at the encounter frequency (the rate at which a moving hull meets the waves), adds the simplest speed correction to the hull boundary condition, and includes the speed term in the pressure. It leaves out the steady flow around the moving hull, so it is an approximation, and we labelled it that way. We ran it against three sets of measurements:

- the Kashiwagi tank hull (length/beam 6.67) at Froude number 0.2: heave-pitch coupling coefficients from forced-oscillation tests, heave and pitch motions, and added resistance;
- Journée's two length/beam 10 Wigley hulls, for which we only have peak values quoted second-hand;
- the programme's 4 m monohull, using the same wave climate as earlier steps.

The expectations were committed before the full run. A prototype had already been run at a few points, and the log says which.

**On the tank hull the 3D model is worse.** With the same viscous damping, the 3D heave is **36% above** the measurement at 1.0 to 1.3 hull lengths. The strip theory is 3% above. The 3D motions push the added resistance to **1.22 times** the measured area, where the strip theory gives 0.93. The coupling coefficients show where it goes wrong. The 3D model gets the pitch moment caused by heave closer to the tank than the strip theory does. But its heave force caused by pitch (the damping B35) is 1.6 times the measured value. That is the term the simplified speed correction controls.

**On the length/beam 10 hulls it is better.** The predicted added-resistance peaks rise from 0.70 and 0.78 of the measured values to **0.82 and 0.85**. One heave point that was 32% low becomes 10% low.

So the same model is too high on one hull and too low on the other. That makes it a poor explanation of either gap. Five of the nine expectations held. Of the four that failed, one was a mesh test that used relative errors where the heave nearly cancels to zero. The other three were wrong in size, not direction.

**What it changes.** On the 4 m monohull the 3D motions raise the motion part of the wave loss by 12.5%. The 30 W range loss moves from 3.39% to **3.80%**, still inside the paper's 3.4% to 4.2% bracket, and the 200 W conclusion holds. The paper gains one sentence. The next test needs a forward-speed model that includes the steady flow around the hull, to see whether B35 comes down to the measured value.

Code and full output: [`run_panel_speed.py`](../../research/marine-hull/experiments/run_panel_speed.py), [`results_panel_speed.txt`](../../research/marine-hull/experiments/results_panel_speed.txt).
