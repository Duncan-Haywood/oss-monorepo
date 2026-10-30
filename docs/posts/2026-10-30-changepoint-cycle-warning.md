---
title: "Telling users their 23 changepoints are probably false"
date: 2026-10-30
tags: [changepoint-detector, time-series]
description: "The changepoint detector now warns that many steps on an autocorrelated series may be false alarms, with the measured counts for real lynx and sunspot cycles."
---

On the real lynx series the default changepoint model reports 23 steps and on yearly sunspots 46, and none is documented. The detector already warned about these series, but only that the date ranges were too narrow, which hides the bigger problem: the steps themselves.

The warning now adds, when there are 5 or more steps and lag-1 autocorrelation is 0.3 or more, that many may be false alarms. It cites the measured result: `--ar1` found none on both series and `--ar1 joint` kept a 2 standard deviation step we inserted. The check is a regression test on the real data.

The limit is the trigger. Tree rings (38 false steps) have a rho estimate of 0.16, so they get no hint. A cycle check that does not depend on rho is the next piece.
