---
title: "Making the 'when did growth change?' range honest on clumpy counts"
date: 2026-10-25
description: "The Changepoint Detector's 95% range for a growth-rate change held the true bend only 90% of the time on clumpy counts. A wider weighting fixes it."
tags: [changepoint-detector, calibration, evaluation]
---

The Changepoint Detector gives a range for the point where a count series
started growing faster. A 95% range should hold the true point 95% of the time.
On clumpy counts (each count drawn at its own random rate) ours held it on 145
of 161 found bends, 90%.

We tried three widenings on three seeded sets: 1.15 (the old setting) covered
145 of 161, 1.4 covered 153 (95%) and 1.7 covered 157 (97.5%, with wider
ranges). We kept 1.4 for the negative-binomial path only; plain Poisson counts
stay at 1.15.

Choosing the setting on the same seeds it was scored on flatters it, so we ran
three fresh seeds once: 161 of 170 found bends covered, 94.7%. The weakest case
is still a large, sharp bend (86%). Ranges are about 15% wider than before.
All of it is synthetic; a real series with a documented slope break is the
open check. Output and code: `ventures/changepoint-detector/eval/`.
