---
title: "Strip-theory heave on the Wigley III hull matches Journée's tank tables to 3%, so pitch is what's left"
seo_title: "Wigley III strip-theory heave against Journée's tank data"
date: 2026-11-24
tags: [research, marine-hull, seakeeping, strip-theory, added-resistance]
description: "Sixteen of Journée's tabulated Wigley III values: strip heave within 3% at Fn 0.2, loads within 11%. The added-resistance gap is not in heave."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m survey boat loses in head seas. It has one open problem. On Journée's (1992) slender Wigley hulls (length 10 times the beam), both of its added-resistance formulas reach only 0.70 to 0.81 of the measured peaks at Froude number 0.2. Earlier steps ruled out the formula, the grid, the heave-pitch coupling and two 3D panel variants. That left two suspects: the strip model's forward-speed motions, or the data. The data we had were peaks only, quoted second-hand.

**A better source turned up.** The open strip-theory code [boatmath](https://github.com/electricshipwrights/boatmath) (MIT) asserts its own model in its test suite against sixteen of the report's tabulated values for Wigley III. They cover forced-heave added mass and damping at Fn 0.3, the heave force and pitch moment on the held hull, and heave in head waves at Fn 0.2 and 0.3. These are still second-hand, since the report's host does not answer from here. But they are tables across frequency, not one peak. We used the numbers only and copied no code.

**What ran.** Nothing in the model changed. We ran the paper's strip model on Wigley III on its working grid and on a finer one, with six expectations committed before any code was written. It is stdlib Python and took 166 s.

**What came out** ([results](../../research/marine-hull/experiments/results_journee_tables.txt)), model over measured:

| quantity (Wigley III) | ratio |
|---|---|
| heave RAO, Fn 0.2, λ/L 1.25 / 1.5 / 2.0 | 1.006 / 0.971 / 0.979 |
| heave RAO, Fn 0.3, λ/L 1.25 (nearest resonance) | 0.921 |
| heave RAO, Fn 0.3, λ/L 1.384 to 2.0 | 0.955 to 1.001 |
| restrained heave force, Fn 0.3 | 0.946 to 1.054 |
| restrained pitch moment, Fn 0.3 | 1.057 to 1.110 |
| heave added mass, Fn 0.3 | 0.891 to 0.927 |
| heave damping, Fn 0.3 | 0.974 to 1.139 |

Five of the six expectations held. The refuted one predicted the damped heave near resonance would be more than 15% low, as it was on Wigley I at the same point (−31.6%). On Wigley III it is 7.9% low. The finer grid moves no ratio by more than 0.47%.

**What it means.** On the hull where the model reaches 0.78 of the measured added-resistance peak, the heave it feeds into the formula is right to within 3% at that speed. So the shortfall does not come from heave. Pitch at forward speed is the one motion left untested. boatmath's documentation reports that strip theory gets pitch added inertia about 30% low on these hulls, and that its pitch damping grows with speed where the tank's does not. We have not checked that claim ourselves. The paper's open question narrows from "the forward-speed motions" to "pitch at forward speed, or the data".

**Limits.** This covers Wigley III only; boatmath's tables quote no other hull. There are no pitch values. The numbers were typed by a third party from the report's data files. The damping is the fit carried over from a different tank hull.

**Next.** Journée's pitch tables if a host serves them. Until then, a pitch-only sensitivity on Wigley III, labelled as such.
