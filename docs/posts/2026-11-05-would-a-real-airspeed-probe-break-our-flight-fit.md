---
title: "Would a real uncalibrated angle-of-attack probe break our flight-test fit?"
seo_title: "Angle-of-attack probe bias vs system identification: a sourced check"
date: 2026-11-05
tags: [research, aerolog-scaling, system-identification, uav]
description: "A simulated output-error fit tolerates about 1.25 degrees of angle-of-attack bias. A published small-UAV five-hole probe calibration found 2.49 degrees."
---

In the `aerolog-scaling` programme, a simulated phugoid and short-period identification from a released disturbance fails abruptly once the angle-of-attack channel carries a constant bias of about 1.5 degrees. A fit that also estimates the bias tolerates 1.25 degrees (2 of 160 fits fail) and breaks by 1.5 (86 of 160). Until today that bias was a swept number with no source.

Sun and Gebre-Egziabher (*Journal of Guidance, Control, and Dynamics*, 2020, doi:10.2514/1.G004713) calibrated a five-hole probe on small-UAV flight data and estimated an angle-of-attack bias of -2.49 degrees, standard deviation 0.56. That is about twice our tolerance, and one standard deviation below it is still past the cliff. An uncalibrated probe of that kind would land on the failing side.

What this does not show: it is one probe, one airframe and one flight, and an uncalibrated bias is not the residual left after a pre-flight calibration. That residual is the next thing to source. The log entry is milestone 9ai in `research/aerolog-scaling/LOG.md`.
