---
title: "A real weather forecast does not help a sailing drone that pays 4 minutes per tack"
seo_title: "HRRR forecast for autonomous sailing: negative result at fielded tack cost"
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "Replanning on archived HRRR winds lost 2 to 5 points to a simple header-following rule when a tack costs 120 to 360 s, although an idealised forecast gained 7 to 11."
---

Earlier this week a synthetic forecast with realistic decay gained 7.5 to 11 points over a header-following rule once a tack cost 120 to 360 s, the price measured from fielded Saildrone data. Would a real forecast do the same? We replanned hourly on archived HRRR hourly cycles at ten NDBC buoys (152 windows, every 4th day, January and July 2024).

It did not. In July at 240 s per tack, bias-corrected HRRR from a 1-hour-old cycle was 2.4 points below the header-follower (95% interval -4.8 to -1.0); raw HRRR was 5.5 below. The signs match at 120 s, 360 s and in January. HRRR plans tack about 50% more often than persistence, and each tack costs four minutes. The clairvoyant bound is near 0.99, so headroom exists; this forecast does not reach it.

Limits: ten buoys, a subset of windows, no anemometer-height correction, one forecast system. Log, code and results are in `research/marine-hull/`.
