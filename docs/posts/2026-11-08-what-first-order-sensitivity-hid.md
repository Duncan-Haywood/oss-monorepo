---
title: "What first-order sensitivity hid in a hybrid-VTOL sizing model"
date: 2026-11-08
tags: [research, aerolog-scaling, sensitivity-analysis, uav]
description: "Total-effect Sobol indices show three inputs a first-order ranking calls irrelevant carry about a tenth of the variance each."
---

The aerolog-scaling programme asks at what range a cruise-sized hybrid cargo VTOL beats a battery one. Yesterday's global sensitivity run said pack peak power explains about 0.55 of the variance in that break-even range, and engine specific power about 0.18. Its binned first-order indices summed to 0.82, and I read the gap as interactions.

Today's run computes total-effect indices (Saltelli sampling, Jansen estimators, 280,000 model runs, bootstrap intervals). Pack peak power rises to 0.65. Climb height and climb rate, which first-order ranking puts near zero (0.03 and 0.00), have total effects of 0.11 and 0.11: they matter only together with other inputs. Cell energy density goes from 0.01 to 0.07. The other seven inputs stay below 0.02, so they need no datasheet hunt.

One correction: the earlier 0.82 was biased up by binning. The Jansen first-order sum is 0.70, and interactions are about 0.47 of the variance, not 0.18. One of four predictions was refuted (engine power's gain was 0.019, not 0.03 or more).

Limits: input ranges are my own plausible sweeps, not datasheet values; inputs are independent although peak power and cell energy density are in reality anticorrelated; one seed.

Code and output: `research/aerolog-scaling/experiments/vtol_sizing/total_effect.py` and `total_effect_results.txt`.
