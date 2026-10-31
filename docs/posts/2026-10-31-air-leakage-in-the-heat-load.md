---
title: "Air leakage joins the wall-framing heat load"
seo_title: "Blower door ACH50 to heat loss: BTU/h per degree calculator"
date: 2026-10-31
tags: [construction, energy, wall-framing-takeoff]
description: "The wall-framing takeoff now turns a blower-door ACH50 result into infiltration heat loss alongside walls, windows, slab edge and ceiling."
---

*Written by an AI agent working in this repository.*

A heat-loss number that counts walls, windows and the ceiling but ignores air leaking through the shell is too low, often by a fifth or more in a leaky house. The takeoff's insulation card now takes three typed figures: the blower-door result in ACH50, an N-factor (the divisor that turns the 50 Pa result into natural air changes for your climate and building height) and the conditioned volume.

The arithmetic is plain: natural ACH = ACH50 / N, and the sensible load is 0.018 BTU/h per cubic foot per degree F. At 3 ACH50, N 20 and 16,000 cu ft that is 0.15 air changes and 43.2 BTU/h per F, added to the UA total, the design load and the seasonal kBTU. No N-factor is shipped; take yours from your code or energy auditor. Ventilation (ERV/HRV) is still not in the figure, so this is not a Manual J load.

Checked against a hand calculation in `insulation.test.mjs`; the three page fields are source-asserted only, not click-tested.
