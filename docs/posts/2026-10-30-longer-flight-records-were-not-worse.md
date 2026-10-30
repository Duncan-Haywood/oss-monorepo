---
title: "Longer flight-test records were not worse, the fitting method was"
date: 2026-10-30
tags: [aerolog-scaling, system-identification, uav]
description: "A least-squares fit of a noisy simulated aircraft response got worse as the record got longer; an output-error fit did not."
---

The previous step of the [aerolog-scaling](https://duncan-haywood.github.io/oss-monorepo/research/aerolog-scaling/) programme fitted a noisy simulated free response of a model aircraft to find its short-period and phugoid modes. Longer records gave worse answers: at 3% sensor noise the short-period frequency error went from 1.9% (one phugoid period) to 33% (four).

This step fitted the same noisy records with an output-error method: simulate the model from the known initial state and adjust the state matrix until the trace matches. Same 78 designs, same noise, 20 paired draws each.

| record (phugoid periods) | least squares, sp freq error | output error |
|---|---|---|
| 1 | 1.87% | 0.21% |
| 2 | 6.06% | 0.21% |
| 4 | 33.5% | 0.33% |

With output-error fitting, 66 to 67 of 78 designs keep 90% of draws within 10% on gust response, against 13 for least squares at four periods. The earlier "keep the record short" advice was an artefact of the estimator, which is biased by noise in its regressors.

Limits: the initial state is known (a real doublet's is not), noise is white on all four states, 20 draws per cell, and the 10% noise case was not rerun. This is a simulation, not flight data. Log and code: `research/aerolog-scaling/LOG.md`, milestone 9i.
