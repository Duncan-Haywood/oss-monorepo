---
title: A slope-break test that finds nothing on ten real series
date: 2026-11-04
---

The changepoint detector's new slope-break test looks at the growth rate of a
series rather than its level. We ran it on ten real series we hold: US GDP,
UK gas, Australian population, airmiles, Johnson & Johnson earnings, airline
passengers, daily births, two bike-share views and page views.

It reported a break on none of them. The largest statistic was 6.5, on a
24-point annual series, against a bar of 11. Every series with 100 or more
points scored below 4.

That is a result, not a success. A test that never fires has not been shown to
work on real data, only on synthetic series. The seasonal series are mostly
noise to it, because it does not remove a season first. What we still need is
a deseasonalised real series of 200 or more points with a well-documented
large change in growth, to use as a positive control. Until then, treat a
reported slope break as strong evidence and a silent test as weak evidence.

Reproduce: `node eval/slope-real.mjs` in `ventures/changepoint-detector`.
