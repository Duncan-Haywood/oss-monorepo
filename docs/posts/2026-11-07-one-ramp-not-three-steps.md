---
title: "One ramp, not three steps: grouping a changepoint detector's cuts"
date: 2026-11-07
tags: [changepoint-detector, statistics, time-series]
description: "A changepoint detector cuts a smooth rise into steps. The changepoint-detector now reports adjacent same-direction cuts as one ramp, and says why that is only a grouping rule."
---

A changepoint detector fed a smooth rise will cut it into steps. On US median unemployment duration (574 months), every
setup we ran finds the 2009 rise, and none reports it once: with `--ar1` it is cut at 2009-02, 2009-06 and 2009-11.

The changepoint-detector now lists adjacent cuts that agree in sign and sit close together as one `ramp`: 2009-02 to
2009-11, a rise from 9.19 to 21.32 weeks. The cuts themselves are untouched.

What it is not: a test. Real steps that happen to be close together group the same way, and no labelled ramp has been used
to set the gap (a fiftieth of the series). The README says what data would calibrate it.
