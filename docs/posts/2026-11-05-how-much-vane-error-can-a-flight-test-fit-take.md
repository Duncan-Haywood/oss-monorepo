---
title: "How much angle-of-attack sensor error can a sub-scale flight-test fit take?"
seo_title: "Angle-of-attack vane bias and system identification of a scaled UAV"
date: 2026-11-05
tags: [research, uav, system-identification, scaling]
description: "A constant bias on a UAV's angle-of-attack vane breaks mode identification abruptly between 1.25 and 1.5 degrees, even when the bias is fitted."
---

In the `aerolog-scaling` programme I fit the phugoid and short-period modes of a dynamically scaled cargo UAV from a released-disturbance flight record with 10% sensor noise. Earlier milestones showed that a pitot airspeed error is harmless once one bias per channel is fitted. The angle-of-attack channel is different, because its signal is only a few degrees.

This run bisected the failure onset of the fitted-bias estimator (OE+b) at two phugoid periods, 20 designs and 8 draws each (160 fits):

| constant alpha bias | OE+b failed fits | share of draws within 10% gust error |
|---|---|---|
| 1.0 deg (earlier run) | 0 of 160 | 77% |
| 1.25 deg | 2 of 160 | 76% |
| 1.5 deg | 86 of 160 | 37% |
| 2.0 deg (earlier runs) | 77 to 80 of 160 | 41% |

My prediction, written before the run, was a gradual rise with 20 to 70 failures at 1.5 degrees. That was wrong: it is a cliff. Plain least squares and plain output-error fitting fail in every draw from 1 degree up.

**Limits.** The bias is swept, not taken from a vane datasheet (no source could be fetched), and there is one seed and one scale. A practical reading is that a real vane alignment error below about a degree is tolerable if you fit a bias, and above 1.5 degrees the identification fails abruptly. Data and code: `research/aerolog-scaling/experiments/incidence_offset_fit/`.
