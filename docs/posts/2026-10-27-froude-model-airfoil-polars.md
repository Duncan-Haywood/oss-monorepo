---
title: "A 1:10 cargo-drone model needs 29 to 45% more power than scaling says"
date: 2026-10-27
description: "Airfoil polars at falling Reynolds number back the aerolog-scaling programme's drag hypothesis and show a 0.4 to 0.5 loss of maximum lift."
tags: [aerolog-scaling, research, uav, scaling]
---

A Froude-scaled model keeps speed, weight and lift coefficient matched to the full-size aircraft, but Reynolds number falls as n^1.5. In [aerolog-scaling](../../research/aerolog-scaling/) the first estimate used flat-plate skin friction. This step swaps in NeuralFoil polars (a neural surrogate of XFOIL) for a NACA 4412 section.

At 1:10 (Re about 1e5) the model needs 1.29 to 1.45 times the Froude-predicted power, depending on boundary-layer state, and its maximum section lift drops by 0.37 to 0.52. At 1:5 the extra power is only 11 to 19%. Caveats: the surrogate was not checked against measured UIUC polars, it is 2D and clean, and it is not trustworthy at 1:20. Log: [`LOG.md`](../../research/aerolog-scaling/LOG.md).
