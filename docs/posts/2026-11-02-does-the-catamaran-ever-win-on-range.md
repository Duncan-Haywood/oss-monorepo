---
title: "Does a catamaran ever beat a monohull on range? A sweep with tank-bound drag"
seo_title: "Catamaran vs monohull range, 200 kg survey boat: a sweep"
date: 2026-11-02
tags: [marine-hull, catamaran, monohull, survey-boat]
description: "For a 200 kg survey boat, a catamaran never out-ranged an equal-length monohull in 243 cases using Michell wave theory and tank-bound form factors."
---

Small survey boats are often catamarans for deck area. Do they also go further per kWh?

In the open marine-hull programme we swept 729 cases for a 200 kg craft at 30 W hotel load: Michell thin-ship wave resistance, ITTC-1957 friction, form factors from 0.03 to 0.15 (an upper bound read off 22 Delft yacht tank hulls), catamaran interference of 0 to 0.3, and hull lengths of 3 to 5 m.

The catamaran out-ranged the monohull in 7 cases (1.0%) and in none of the 243 where both hulls have the same length. Median range ratio was 0.86. The seven wins all pair a 3 m monohull against a longer catamaran, so they reflect length, not hull type. We predicted this before running it and it held.

Limits: Wigley hull forms, form-factor bound from keeled yachts, interference and hotel load not sourced from a boat like this. Code and results: `research/marine-hull/experiments/run_michell_lowk.py`. Estimates, not design advice.
