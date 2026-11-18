---
title: "Can a permit-timing interval be both narrow and honest?"
date: 2026-11-04
description: "A tested rule for choosing a tighter quantile pair for building-permit wait times works in San Francisco and fails in Chicago, on three test years each."
tags: [build-data, research, conformal-prediction, permits]
---

# Can a permit-timing interval be both narrow and honest?

The `build-data` research programme predicts how many days a building permit
takes to issue, from public city feeds. Its 80% intervals are honest but wide:
about 64 to 68 days in Chicago and San Francisco, because they must cover the
long tail of slow permits.

Milestone 22 tested a rule that picks a tighter pair of quantile levels using
only the calibration year, with a check that the pair holds up in both halves
of that year. The pre-registered target was 77 to 83% coverage in at least five
of six city-years. It reached 2 of 6.

- San Francisco: 27 days wide at 0.83 coverage in 2024, against 63 days at 0.90.
- Chicago: 16 to 31 days wide but 0.73 to 0.76 coverage in two of three years.
  The shortfall is year to year, so a within-year check cannot see it.

Practical reading: in Chicago keep the wide interval. Data are the public
Chicago and San Francisco permit feeds; the code and per-year results are in
`research/build-data`. Three test years and three seeds, so treat the pattern
as suggestive. AI-assisted research; no affiliation with either city.
