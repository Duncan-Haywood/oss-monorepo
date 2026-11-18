---
title: "Fixing one sourced number shrinks the Wingcopter drag gap"
date: 2026-11-07
description: "Fixing the Wingcopter 198 wingspan at its published 1.98 m shrinks the zero-lift drag needed to match its quoted 94 km range to 1.5 to 3 times a clean airframe."
tags: [research, uav, aerolog-scaling]
---

A cargo VTOL that carries 25 kg should fly further than the 94 km its maker quotes if it were a clean airframe. Yesterday's check said the zero-lift drag needed to match 94 km was two to four times a clean aircraft's. That sweep let aspect ratio vary on its own, which a real wing cannot do.

The maker's page gives the Wingcopter 198's span as 1.98 m (198 x 152 x 65 cm). Fixing the span ties aspect ratio to wing area, and the wing area is the only unknown left. Over 0.5 to 1.0 m2 the needed zero-lift drag coefficient is 0.105 down to 0.053, about 1.5 to 3 times a clean 0.035. A clean airframe at 0.7 m2 reaches a lift-to-drag ratio of 9.7.

What this does not settle: the wing area is unpublished (the datasheet is request-only), so the gap could still be idle lift rotors and booms, or a bigger reserve than assumed. Code, predictions and results are in `research/aerolog-scaling/experiments/wingcopter_check/`.
