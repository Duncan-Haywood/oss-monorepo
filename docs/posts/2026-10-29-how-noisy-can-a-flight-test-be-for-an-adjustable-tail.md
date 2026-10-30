---
title: "How noisy can a flight test be before the adjustable tail stops working?"
seo_title: "Pitch-mode identification noise and an adjustable tail on a cargo UAV"
date: 2026-10-29
tags: [research, aerolog-scaling]
description: "A least-squares fit of a simulated noisy free response shows what sensor noise and record length the adjustable-tail fix for a sub-scale cargo drone tolerates."
---

The aerolog-scaling programme asks whether a small model of a cargo aircraft can stand in for the full-size one. Earlier steps found that no fixed tail copes if the real tail lift slope is 20 to 25% below the airfoil code's estimate, but a tail whose area is set in flight from the measured short-period mode does. That only helps if the mode can be measured.

This step simulates the four-state longitudinal model released from a disturbance, adds white sensor noise, and fits the transition matrix by least squares. With noise at 1% of each channel's rms and one phugoid period of record, the short-period frequency is off by 0.3% and 87% of draws keep every gust peak within 10%. At 3% noise it is 83 to 85%; at 10% it is 61 to 63%.

The surprise: longer records are worse. At 1% noise the short-period error grows from 0.33% to 4.5% when the record goes from one to four phugoid periods, because the short period has died away and extra samples add only noise. The flight-test card should record the first few short-period cycles at a high rate. The fit is a naive floor; a better estimator is next. Limits: white noise, no turbulence, one seed. Details: `research/aerolog-scaling/LOG.md`, milestone 9h.
