---
title: "Gable wall panel cut lists now measure plates along the slope"
date: 2026-10-27
description: "A bug fix in wall-framing-takeoff: shop panels on a gable end listed sloped plates by their flat run, so every cut was short."
tags: [wall-framing-takeoff, construction, bugfix]
---

Splitting a gable end wall into shop panels in [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) listed the sloped top and cap plates by their horizontal run instead of their length along the roof slope. On a 6/12 gable the cuts came up about 12% short. Plates are now trimmed along the slope, and a test adds the panel pieces back up to the whole-wall plate. Checked on a hand-made 20 ft gable wall only. Layout aid, not engineering advice.
