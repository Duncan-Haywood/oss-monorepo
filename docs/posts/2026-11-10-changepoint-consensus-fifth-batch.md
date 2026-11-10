---
title: "Changepoint consensus on three more real series: two documented dates the panel misses"
seo_title: "Changepoint detection on real data: where settings agree"
date: 2026-11-10
tags: [changepoint, time-series, statistics, open-source]
description: "The free changepoint detector's consensus panel on three more real series: one documented date found by half the settings, two missed."
---

The [changepoint detector](../../ventures/changepoint-detector/) has a
`--consensus` option that runs six settings and reports how many agree on each
change. We ran it on three more real series that have a documented event.

- **Arrivals from the US to Australia:** the 11 September quarter (2001Q3) is
  found by 3 of 6 settings. The Sydney Olympics quarter (2000Q3) is not found
  by enough settings to be listed.
- **Peace Bridge traffic:** the one change all six agree on is the 2008
  recession (2008-11). The passport rule of June 2009 is not listed; the
  recession is too close and too large.
- **Australian air passengers:** 2002, the year after Ansett's collapse and
  11 September, reaches 3 of 6, behind an undocumented 1991 at 5 of 6.

The reading: agreement is a guide, not a guarantee. A documented event can sit
in the middle tier, or vanish when a bigger shock overlaps it. Across the real
series, some documented dates reach the top tier and some do not, and we have no
labelled set yet to turn this into a detection rate. Numbers and the script
that reproduces them are in the README.
