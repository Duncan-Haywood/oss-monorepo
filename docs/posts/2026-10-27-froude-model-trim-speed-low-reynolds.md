---
title: "A 1:10 Froude model of a cargo drone trims 6.5% fast"
date: 2026-10-27
description: "With airfoil polars at each surface's Reynolds number, a 1:10 Froude model misses the 5% trim-speed bar unless flown at the full-size lift coefficient."
tags: [aerolog-scaling, research, uav, scaling]
---

Froude scaling promises that a model keeps trim speed and mode frequencies in scaled units. It does so only if the coefficients stay fixed, and at 1:10 the Reynolds number is about 1e5, not 3e6. In [aerolog-scaling](../../research/aerolog-scaling/) a 4-state longitudinal model with NeuralFoil polars (a surrogate for XFOIL) shows what that does for a tripped wing: flown at the full-size trim angle, the model trims 6.5% faster and its short-period frequency moves 5.1%, so the 5% bar in hypothesis H1 fails. Flown at the full-size lift coefficient, frequencies stay within 1.3% but short-period damping drops 6.3%.

Free-transition runs at 1:10 enter a laminar-bubble regime where the surrogate is not trusted, and phugoid damping depends on a thrust law the model lacks, so neither is reported. There is no gust response yet, and the polars are not checked against measured UIUC data.
