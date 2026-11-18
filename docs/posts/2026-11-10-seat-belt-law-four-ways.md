---
title: "Dating the UK seat-belt law four ways from monthly casualty counts"
seo_title: "Changepoint detection on UK driver casualties: seat-belt law 1983"
date: 2026-11-10
tags: [changepoint-detector, real-data, statistics]
description: "Four Gaussian changepoint setups run on 192 months of UK driver casualties all bracket the February 1983 seat-belt law; one dates it to the month."
---

The front-seat seat-belt law in Great Britain took effect on 31 January 1983.
Our open changepoint detector had already found it in the monthly
driver-casualty counts with a count model. This run asked whether the simpler
Gaussian models find it too, since most users will reach for those first.

All four setups (plain, `--log`, `--ar1`, `--bootstrap`, each with a 12-month
season removed) put February 1983 inside the 95% range. Three date the change
at January 1983, the month the law started and a month the count was already
low. Taking logs dates it at February 1983, the first full month under the
law, with the tightest range. The `--ar1` and `--bootstrap` settings also
drop a two-month dip in 1981-82 that the plain model reports as two changes,
cutting the count from 8 to 5 and 6.

This is one series with one documented break, so it shows the ranges are
sensible here, not that they are calibrated. The numbers are pinned in
`ventures/changepoint-detector/seatbelt-law.test.mjs`.
