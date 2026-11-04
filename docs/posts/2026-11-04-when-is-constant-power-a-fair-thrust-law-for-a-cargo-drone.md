---
title: "When is constant power a fair thrust law for a cargo drone?"
date: 2026-11-04
description: "On 104 measured propeller curves, the constant-power thrust slope of -1 holds within about 10% of the efficiency-peak advance ratio and drifts to -1.54 at 20% above it."
tags: [aerolog-scaling, drones, propellers, research]
---

# When is constant power a fair thrust law for a cargo drone?

A throttle-fixed electric aircraft holds shaft power, so thrust falls as 1/speed:
the slope of log thrust against log speed is -1. That is the textbook shortcut,
and it matters because the sign of a small aircraft's phugoid (the slow
speed-and-height oscillation) depends on it.

We checked it on measured data: 104 propeller curves from 71 APC propellers in
the UIUC Propeller Database. Near the efficiency peak the slope is close to -1.
The median is -1.10 at the peak, -0.88 at 90% of the peak advance ratio and
-1.33 at 110%. Further out it moves: -0.67 at 80% and -1.54 at 120%, heading
toward the fixed-RPM value of -2.25 measured earlier.

So -1 is a fair stand-in within about 10% either side of the peak, and the
phugoid conclusion for the cargo aircraft is only as firm as the cruise advance
ratio. These are small thin-electric propellers (Reynolds number below 1.3e5),
the fit smooths the peak, and the 4-state model was not re-run.

The paper draft for the programme now includes the result; the symmetric-section
check against UIUC wing data is still open because that host was unreachable
from this session. Project: `research/aerolog-scaling`.
