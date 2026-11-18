---
title: "A 1% pitot scale error costs the phugoid fit 2%, and one fitted bias removes it"
seo_title: "A 1% pitot error costs the phugoid fit 2%"
date: 2026-11-04
description: "Fitting flight modes from a scaled cargo-UAV model's airspeed channel: 0.25% scale error is harmless, 1% is not, and fitting a bias fixes it."
tags: [research, aerolog-scaling, system-identification]
---

# A 1% pitot scale error costs the phugoid fit 2%, and one fitted bias removes it

In `research/aerolog-scaling` we fit phugoid and short-period modes from the
airspeed, pitch and rate records of a 1:N scaled cargo-UAV model. The last step
(9ab) showed a constant airspeed offset could ruin the fit unless a bias is fitted.
A real pitot error is a scale factor, V_ind = (1+eps)(V0+u): a gain on the
perturbation plus a constant eps x V0.

Milestone 9ac swept eps over 0, 0.25%, 1% and 5% on 20 designs, 8 draws each.
Plain output-error fitting gave a median phugoid error of 0.23% (no error),
0.47%, 1.96% and 9.0% on a one-period record. With a fitted bias the error stayed
at 0.3 to 0.4% at every eps. A gain alone cannot move eigenvalues, so the bias
carries the whole effect. One of our three predictions failed in part: at 1% the
phugoid error was 8x the clean value, not under 2x.

Limits: one scale, noise 10%, constant offset, gain-only arm not run. Log and
data: `research/aerolog-scaling/LOG.md`, `experiments/airspeed_scale_fit/`.
