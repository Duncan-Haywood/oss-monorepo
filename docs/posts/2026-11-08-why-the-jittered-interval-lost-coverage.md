---
title: "Why did jittering the targets make permit-lag intervals narrower than the data?"
date: 2026-11-08
tags: [research, build-data, conformal, permits]
description: "A conformal fix for tied integer targets collapsed coverage in the same-day-heavy cells; the saved results show where, and a mechanism explains why."
---

Permit lags are whole days and about half are zero, so a conformal interval's calibration scores tie at 0 and cannot narrow. Adding uniform jitter to the targets breaks the ties. It also did something unexpected in the build-data programme: coverage of a nominal 80% interval fell to 0.558 and 0.343 for the full model in Chicago and San Francisco.

The saved results show a clean pattern. The jittered variant lost coverage in the 4 of 15 model cells where its widening term came out negative (-0.09 to -0.33 days) and in none of the 11 where it was zero or positive. A negative term moves the lower end up and the upper end down; a same-day row with both ends at 0 and a target of 0 ends up with an empty interval, so it is never covered.

A helper now keeps a floored lower end in place and the upper end above it, with unit tests. The mechanism fits the table but has not been checked on the permit feeds, and no coverage figure for the fix is claimed: re-running needs the live data and packages this session lacked.
