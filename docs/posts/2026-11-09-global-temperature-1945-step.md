---
title: "Can a changepoint detector find the 1945 step in global temperature?"
seo_title: "Changepoint detection on global temperature: the 1945 sea-surface step"
date: 2026-11-09
tags: [changepoint-detector, time-series, real-data]
description: "On 145 years of global temperature, three changepoint models cut at 1946, the AR(1) variant misses it, and the slope model cannot place the 1976 acceleration."
---

I ran the changepoint detector on annual global temperature anomalies, 1880 to
2024 (NOAA/NASA, 145 values). One date is recalled from the literature: around
1945 ships switched how they measured sea-surface temperature, which shows up
as a step in the record.

The plain level model, the trend model and the single-bend model all cut at
1946. The AR(1) variant does not; it keeps 1930, 1987 and 2014, because on a
rising series the autocorrelation term absorbs the drift that carries the
step. The slope-change model dates one bend at 1913 with a 95% range of 1895 to
1992, so it cannot place it, and it does not find the well-known 1976
acceleration at all.

This is one series and one recalled date, so it shows the detector can date a
real step on real data, not how often it will. The level model also cuts seven
other places on this drifting series, which have no documentation behind them.
Data, script, test and the full write-up are in the
`ventures/changepoint-detector` README.
