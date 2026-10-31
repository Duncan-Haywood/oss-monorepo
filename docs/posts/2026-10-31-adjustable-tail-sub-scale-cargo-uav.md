---
title: "A sub-scale cargo drone needs a tail you can adjust in flight"
seo_title: "Froude-scaled cargo UAV model: why the tail must be adjustable"
date: 2026-10-31
tags: [aerolog-scaling, scaling, uav]
description: "In our simulations no fixed tail keeps a 1:5 cargo-aircraft model's gust response within 10% if the tail lift slope is 25% off; a tail area set in flight does, for 67 of 78 designs."
---

A 1:5 Froude-scaled model of a cargo aircraft flies at a Reynolds number where the tail's lift slope is poorly known. In the `aerolog-scaling` programme, with the true slope 0.75 to 1.0 of the surrogate's, none of 78 mode-matched tails kept the gust response within 10% at every slope. A tail-area multiplier set in flight did: 67 of 78 designs stayed within 10% on every gust peak.

**How well the model must be identified.** The fix is only as good as the in-flight estimate of the short-period mode. A fit with 2% error leaves 84 to 86% of noisy draws within 10%; at 5% error it is 58 to 61%, and no design is reliable. A least-squares fit of a noisy free response gets worse with longer records (0.33%, 0.70%, 4.45% frequency error at 1, 2 and 4 phugoid periods); an output-error fit does not (0.21% to 0.33%).

**Limits.** Simulation only, with an unmeasured tail slope, white sensor noise, no turbulence and a known initial state. The paper draft now has this as Section 4.10; the project log has every run and prediction.
