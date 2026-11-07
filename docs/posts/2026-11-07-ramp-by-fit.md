---
title: "Ramp or two steps? Letting the data pick, on simulated series"
seo_title: "Changepoint detection: a line-fit test for ramps versus steps"
date: 2026-11-07
tags: [changepoint-detector, evaluation]
description: "Replacing a fixed gap rule with a BIC comparison of a straight ramp against steps finds long ramps in 33 to 40 of 40 simulated series instead of 0 to 8."
---

Yesterday's check showed our ramp-grouping rule (merge same-direction cuts less than a fiftieth of the series apart) was blind to long ramps: a 48-point rise of height 8 was reported in 0 of 40 simulated series, because the detector cuts it into segments longer than the gap.

The new rule looks at the data instead of the gap. It collects same-direction cuts up to a fifth of the series apart, then asks whether a flat-line-flat fit (two levels, one straight stretch between two knots) beats the steps by BIC, charging the steps for their cut positions. If not, it drops the last cut and tries again.

Same simulation, 300 points, unit noise, 40 seeds. Ramps of 24 and 48 points, height 8: found in 39 and 40 of 40 (was 8 and 0). At height 4: 33 and 33 (was 0 and 0). Two steps 6 points apart, height 8, were called a ramp in 38 of 40; now 1. The cost: a 6-point ramp of height 8 is found 27 of 40 instead of 38, and small step pairs 12 apart are called a ramp 9 of 40 at height 4. Short ramps and close steps look alike in noisy data; the rule only claims that a long one is a line.

All simulated, one noise model, plain `analyze`. It still groups the real 2009 US unemployment-duration rise. Code and output: `ventures/changepoint-detector/eval/`.
