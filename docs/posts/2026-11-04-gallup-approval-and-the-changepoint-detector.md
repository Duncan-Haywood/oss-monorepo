---
title: "Watergate shows up in a changepoint detector; the Kennedy rally doesn't"
seo_title: "Watergate shows in a changepoint detector; the Kennedy rally doesn't"
date: 2026-11-04
description: "We ran the open changepoint detector on 30 years of Gallup presidential approval and recorded what it found and missed."
tags: [changepoint-detector, real-data]
---

# Watergate shows up in a changepoint detector; the Kennedy rally doesn't

We added R's `presidents` series (Gallup quarterly approval, 1945 to 1974, 114 quarters after dropping six missing ones) to the open changepoint detector's real-data tests.

With default settings it cuts eight times and finds two documented events: the January 1953 change of president and the Watergate collapse (cut at 1973Q3, approval 68 to 44 to 27). It also warns that the series is autocorrelated (rho about 0.56), so its ranges are too narrow.

With `--ar1` only two cuts remain, 1953Q1 and 1966Q2, and Watergate is gone. That is the same trade seen on Australian arrivals: fewer false alarms, but real shocks are swallowed.

No setting finds the jump from 57 to 80 in 1964Q1. A rally that fades within a year looks like a spike, and the detector looks for steps. Telling a shape from a shock is still the open problem. Numbers and test: `ventures/changepoint-detector/README.md`, "Presidential approval".
