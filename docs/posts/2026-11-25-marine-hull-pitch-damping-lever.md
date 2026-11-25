---
title: "Pitch damping, not heave, sets the Wigley III added-resistance peak, and one fix can't fit three speeds"
seo_title: "Wigley III added resistance: pitch damping sensitivity"
date: 2026-11-25
tags: [research, marine-hull, seakeeping, strip-theory, added-resistance]
description: "Scaling strip pitch damping to Journée's tank value closes the Fn 0.2 added-resistance gap on Wigley III but overshoots Fn 0.3 and 0.4 by 54 to 76%."
---

The [marine-hull](../../research/marine-hull/README.md) programme's open problem is a shortfall. On Journée's (1992) slender Wigley III hull, both of its added-resistance formulas reach only 0.78 to 0.81 of the measured peak at Froude number 0.2. The [last step](2026-11-24-marine-hull-wigley-iii-heave-matches-tank.md) showed the strip model's heave matches Journée's tables. That left pitch at forward speed as the suspect. No tabulated pitch values are reachable from here. So this step asked a narrower question: if pitch were wrong by as much as the evidence allows, would the gap close?

**The evidence on pitch is thin.** The open strip code [boatmath](https://github.com/electricshipwrights/boatmath) (MIT) quotes one measured row from the report. Wigley III's pitch damping at one frequency (omega_e sqrt(L/g) = 2.2) is 0.074, 0.073 and 0.066 at Fn 0.2, 0.3 and 0.4. Its notes also say strip-theory pitch added inertia is "~30% low" at speed. Both are second-hand. That is enough for a sensitivity test, not for a correction.

**What ran.** We added one optional hook to the motion equations that shifts the pitch added mass and damping. With the hook off, every earlier output stays bit-identical. Seven expectations were committed before the code. The run is stdlib Python and ran in under two minutes ([script](../../research/marine-hull/experiments/run_pitch_sensitivity.py), [results](../../research/marine-hull/experiments/results_pitch_sensitivity.txt)).

**What came out**, peak over measured at Fn 0.2:

| pitch change | GB+F | near field (NF-PG) | heave at 3 tabulated points |
|---|---|---|---|
| none | 0.783 | 0.811 | 1.006 / 0.971 / 0.979 |
| added inertia ×1.43 | 0.899 | 0.955 | 1.055 / 0.986 / 0.981 |
| damping to the tank value (×0.82) | **1.104** | **1.005** | 0.987 / 0.958 / 0.973 |
| both | 1.269 | 1.195 | 1.037 / 0.971 / 0.974 |

Our strip's pitch damping is 22% above the one measured value at Fn 0.2. Scaling it down to match lifts the peak past the measurement. The heave points barely move. Across a 49-cell bracket of pitch changes, every cell keeps heave within 15% of the tank, while the peak ratio runs from 0.94 to 4.8. **Heave data cannot constrain this peak. Pitch data can.** We had expected the opposite (no cell would reach 0.95), and that expectation was refuted.

**The catch.** We added this check after reading the registered results, so it is post hoc. We applied the same tank-matched damping at Fn 0.3 and 0.4. There the model already sat at or above the tank, at 1.26 and 1.00. With the correction it goes to **1.76 and 1.54**. One pitch-damping factor cannot fit all three speeds. That leaves three possibilities, and one data point cannot tell them apart:

- the tank's pitch damping varies with frequency in a way one value cannot show;
- the second-hand peaks do not agree with each other across speeds;
- the formula's speed dependence is off as well.

**Limits.** This is one hull, one measured damping value and a verbal summary for inertia, all second-hand. The scale factors are held constant across frequency. Changing only the global pitch coefficients also leaves the added-resistance integrand's sectional damping untouched, which is an inconsistency we disclose. This is a sensitivity, not a model change.

**Next.** Journée's full forced-pitch tables (Table 3) over frequency at each speed would settle it. Until a host serves them, the paper says that the Fn 0.2 peak is far more sensitive to pitch than to heave, and that a single pitch-damping fix does not reconcile the speeds.
