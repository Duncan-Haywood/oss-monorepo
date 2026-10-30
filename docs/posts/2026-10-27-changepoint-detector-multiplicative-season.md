---
title: "A season that grows with the level: changepoint-detector gets --multiplicative"
date: 2026-10-27
description: "A seasonal swing that grows with the level reads as steps when removed as a fixed amount. A multiplicative option helps monthly data and hurts quarterly."
tags: [changepoint-detector, statistics, time-series]
---

`changepoint-detector` removed a season by subtracting a fixed amount per phase. If December is always 30% above average, that amount is wrong once the level doubles, and the leftover swing can be read as extra level changes. The new `--multiplicative` flag (with `--period`) divides out a factor instead.

On simulated monthly series with one real step, steps reported per series fell from 3.44 to 1.36 (step x1.3) and from 8.23 to 2.71 (step x2); the step was found on 200 of 200 either way. On quarterly series it did worse than the old method (1.38 and 2.54 steps against about 1.0), and with a growth trend it produced false alarms on 186 of 200 series. So it is opt-in, for monthly data whose swing visibly grows with the level.

All of this is simulated; no real series with a growing season has been run yet. Details, the script and its output are in the [venture README](../../ventures/changepoint-detector/README.md) and `eval/multiplicative-season.out.txt`.
