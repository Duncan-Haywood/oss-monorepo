---
title: "A classical describing function predicts the drone oscillation a 20° tilt limit hides, and where it crashes"
seo_title: "Describing function of a quadrotor tilt limit: limit cycle and crash"
date: 2026-11-23
tags: [research, drones, codesign-cant, control, stability]
description: "Treating a quadrotor's tilt-command clip as a describing function predicts its hidden oscillation (1.44 Hz, about 26°) and a crash limit near 45°."
---

The [codesign-cant](../../research/codesign-cant/) programme tunes a small
canted-rotor quadrotor's frame and controller together in simulation. One
of its findings is awkward. Push the attitude integral gain past the
stability ceiling that an 11-state linear model computes, and the linear
model says the loop is unstable. The simulated drone still holds position
and never crashes. Earlier milestones traced this to the 20° tilt-command
limit. The drone isn't stable. It oscillates against the limit, and raising
the limit to PX4's default of 45° makes 535 of 640 such flights diverge.

"Oscillates against the limit" is a description, not a number. This run asked
whether the classical tool for the job, the describing function of a saturation
(Gelb and Vander Velde, 1968), turns it into one.

## What was done

A saturation fed a sine of amplitude A passes on a first harmonic scaled by a
gain N(A). That gain is 1 below the limit and falls toward 4/(πA/δ) far above
it. Put N in place of the clip in the linear model and look for the gain N*
that puts the loop exactly on its stability boundary. That gives a predicted
limit cycle. Its frequency comes from the critical eigenvalue, and its
amplitude from N* and the eigenvector. We did this for 40 design-conditions,
64 held-out plants and two axes: about 5,000 small eigenvalue problems, under
a minute in total. Then we compared the predictions with 18-second simulated
flights. Nine predictions were committed to the log before any of the code
was written.

## What held

- **Every contained instability is a limit cycle.** All 595 unstable
  flight-axes of designs at 1.25× their ceiling have a stable oscillatory
  crossing, and so do all 640 of the more aggressive bolted-on designs.
- **Frequency:** predicted 1.44 Hz, measured 1.44 Hz. The median error is
  2.5%, which is below the FFT's 0.11 Hz bin width.
- **Amplitude:** predicted 26.5° of tilt, measured 24.7°, a median ratio of
  1.09. Raising the limit from 20° to 30° grew the measured cycle 1.56×. A
  saturation's homogeneity predicts 1.50×.
- **Crash limit:** if a flight dies when the cycle reaches the simulator's
  60° divergence angle, the 1.25× designs' median critical limit is 45.5°.
  The simulator's knee is between 30° (8 of 640 dead) and 45° (535 of 640).
  For the bolted-on designs the predicted death count at 30° is 586 against
  588 simulated.

## What didn't

I predicted that the attitude torque command would saturate before the tilt
reached 60°. It doesn't: that would need a 112° limit. The counts near the
knee also miss. Bolted-on designs at 20° lose 128 of 640 flights, and the
describing function predicts 4. It still ranks those flights correctly (AUC
0.87), so the start offset, the wind step and the sensor noise, none of which
the single-sinusoid model sees, push real flights over a little before the
pure cycle would.

One finding was not in the plan, and it narrows an earlier claim. At ten
seeds the linear certificate was *necessary*: no flight it called stable
diverged. That was scored at a 20° limit. At 45°, 29 of the 31 deaths of
tunes sitting on the ceiling happen at plants the certificate calls stable.
They are large-signal transients, and there is no cycle to predict.

## For a builder

If a tune sits past its linear ceiling, the describing function tells you
in under a second how hard it will oscillate and roughly which tilt limit
will kill it. It does not make such a tune safe. Keeping the integral gain
at 0.8× the ceiling remains the rule that survived every limit from 20° to
59° with zero crashes. Everything here is simulated, on one geometry with no
gust torque. Details, code and the committed predictions are in the
[README](../../research/codesign-cant/README.md) and
[LOG](../../research/codesign-cant/LOG.md).
