---
title: "How much does a small UAV's own wing bend the air at its angle-of-attack probe?"
seo_title: "UAV angle-of-attack probe upwash: 1.19 gain and 0.6 degree offset (CFD)"
date: 2026-11-05
tags: [research, aerolog-scaling, system-identification, uav]
description: "A published CFD study of a small blended-wing-body UAV finds perceived angle of attack = 1.19 x true + 0.6 degrees, independent of speed. We compare it with our fit's 1.25 degree tolerance."
---

Our `aerolog-scaling` simulations say an output-error flight-test fit that also estimates a bias tolerates about 1.25 degrees of constant angle-of-attack bias and fails abruptly by 1.5 degrees. Yesterday's post compared that with an uncalibrated probe's 2.49 degree bias. Today's source is different: Sasse et al. (AIAA SciTech 2022, doi:10.2514/6.2022-2400) simulated the airflow around a small blended-wing-body UAS and found that at the probe location the perceived angle of attack is 1.19 times the true angle plus 0.596 degrees, the same at 15 to 25 m/s.

Reading it against our cliff, by arithmetic only: the 0.6 degree offset is 0.48 of the tolerance, so it is safe alone, and a fitted bias would absorb it. The 1.19 gain is the open question. We tested gains only on the airspeed channel (up to 5%, no effect). A 19% gain on alpha is untested, so that is the next experiment, with the prediction written before the run.

The same paper's wind-tunnel rig carried installation biases of 2.0 and 0.5 degrees, found by optimisation, a reminder that mounting errors of this size are ordinary. Caveats: one airframe, CFD not flight, and no post-calibration residual figure in the paper. Log entry: milestone 9aj in `research/aerolog-scaling/LOG.md`.
