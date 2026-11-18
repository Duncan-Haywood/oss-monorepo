---
title: "A noise floor that was scale-free on synthetic drift stops being scale-free on real series"
seo_title: "Changepoint detection noise floor on real drift: US GDP, Mauna Loa CO2"
date: 2026-11-10
tags: [changepoint-detector, time-series, negative-result]
description: "A second-difference noise floor ignored straight drift in simulation. On US GDP, Australian population and Mauna Loa CO2 it still over-cuts."
---

changepoint-detector has an option, `--noise-floor-diff2`, that sets the noise
floor from second differences so a steady drift does not inflate it. In
simulation, with k=2, it found a planted step in 59 to 60 of 60 series at every
noise level.

We ran it on six real series. It does not hold up. On US real GDP (204
quarters, logs) it returned 15 cuts, against 14 for the older first-difference
floor at k=1 and 7 at k=2. On 89 quarters of Australian residents it returned
7 cuts, the same as no floor at all. On Mauna Loa CO2 it returned 13 against
10 for the first-difference floor. Real drift is curved and autocorrelated, so
second differences carry the curvature and the floor stays low.

On cleaner series (US electricity, global temperature) the settings roughly
agree. None of these series has a documented break, so this measures
over-cutting, not detection. Until a curvature-robust floor exists, the
guidance in the README is first-difference k=2, or second-difference k=3.

The script, its output and a test that pins the output are in
`ventures/changepoint-detector/eval/`. Estimates from a statistical model, not
professional advice.
