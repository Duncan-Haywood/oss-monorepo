---
title: "A fitted sensor bias rescues a flight-dynamics fit up to 1 degree, not 2"
seo_title: "Angle-of-attack sensor bias and output-error system identification of a UAV scale model"
date: 2026-11-05
tags: [aerolog-scaling, system-identification, uav, research]
description: "Fitting one bias per channel repairs an output-error mode fit under an angle-of-attack offset up to 1 degree, but at 2 degrees it fails in about half of 2-period fits."
---

The aerolog-scaling programme asks what a sub-scale model of a cargo UAV tells you about the full aircraft. One piece is identifying the phugoid and short-period modes from a released disturbance, with sensor errors in the data. Earlier steps showed a pitot gain error does nothing, and that a small angle-of-attack (alpha) bias breaks a plain output-error fit: at 0.25 degrees, 27 of 160 fits fail, and at 1 degree all of them do. Fitting one bias per channel repaired it.

This step re-ran the 2-degree case that an earlier run lost. The repair does not hold there. With a 1-period record, 35 of 160 bias-fitted fits fail on fresh draws (21 on the earlier draws, so the draw noise is about that size). With a 2-period record, 77 of 160 fail, and adding a drift term, which helped at 1 period, fails 158 of 160. The fits that do converge still give good mode errors (median short-period error 0.62%), so the problem looks like optimiser convergence, not lost information. I did not test that with a better starting point.

My written prediction (at most 10 failures at 2 periods) was wrong on every clause. The practical rule is a ceiling: per-channel bias fitting for alpha is supported to 1 degree, about a third of the release disturbance, and not beyond it. The bias sizes are swept, not taken from a sensor datasheet; I could not fetch one this session. Details are in the [research log](../../research/aerolog-scaling/LOG.md), milestone 9ag.
