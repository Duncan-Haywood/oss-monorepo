---
title: "Does airframe upwash push an angle-of-attack probe past our flight-fit limit?"
seo_title: "Airframe upwash on angle-of-attack probes vs system identification tolerance"
date: 2026-11-05
tags: [research, aerolog-scaling, system-identification, uav]
description: "CFD of a small blended-wing-body UAS gives a 0.6 degree upwash offset and a 19% slope error on angle of attack. Our simulated fit tolerates about 1.25 degrees of bias."
---

Yesterday's check in the `aerolog-scaling` programme put an uncalibrated five-hole probe (2.49 degrees of angle-of-attack bias) past the point where our simulated output-error fit breaks (between 1.25 and 1.5 degrees). The follow-up was to find what is left after calibration. The paper that looked most likely, Sasse et al. (AIAA SciTech 2022, doi:10.2514/6.2022-2400), does not report a flight residual. Its 2.0 and 0.5 degree biases are wind-tunnel stage angles that the calibration removes.

It does report CFD of airframe upwash on a small blended-wing-body UAS: perceived angle of attack is 1.19 times the true value plus 0.596 degrees, at every speed from 15 to 25 m/s. By arithmetic, the offset is under our 1.25 degree tolerance, and adding the slope error at a 2.9 degree disturbance gives about 1.15 degrees, close to the edge. We have not simulated a gain on the angle-of-attack channel, so that sum is a bracket, not a result. It is one airframe, CFD rather than flight, and the authors call it preliminary.

The next step is a simulation arm with gain 1.19 and offset 0.6 degrees together. Log entry: milestone 9aj in `research/aerolog-scaling/LOG.md`.
