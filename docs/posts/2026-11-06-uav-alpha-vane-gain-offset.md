---
title: "Does a 19% angle-of-attack gain error break fitting a UAV's flight modes?"
seo_title: "UAV angle-of-attack probe gain and offset error vs system identification"
date: 2026-11-06
tags: [aerolog-scaling, uav, system-identification]
description: "A simulated fit of a small cargo UAV's phugoid and short-period modes survives the CFD-derived alpha-probe error of gain 1.19 plus 0.6 degrees, if the fit carries a bias term."
---

A small-UAS angle-of-attack probe reads high: Sasse et al. (AIAA SciTech 2022, CFD, a blended wing body) give perceived alpha = 1.19 x true + 0.596 degrees. Does that break identifying a scaled-model's flight modes from a short record?

In a simulation of 20 mode-matched designs (8 noisy draws each, 2 phugoid periods), a least-squares fit with a bias term returned usable modes: 4 of 160 fits failed and 76% of draws kept the gust response within 10%. Fits without a bias term returned wrong modes (0% within 10%). Gain alone cannot move eigenvalues, and the offset is below the 1.25 degrees the earlier bisection found the bias fit tolerates.

My first run looked like the gain hurt (59 to 68% within 10%). That was a bug: the model's initial state was not scaled by the gain. Fixed, kept the buggy output file, and the 76% matches the earlier no-gain rows. Limits: CFD values from one different airframe, one scale and noise level, no in-flight residual after calibration. Log: `research/aerolog-scaling/LOG.md`, milestone 9ak.
