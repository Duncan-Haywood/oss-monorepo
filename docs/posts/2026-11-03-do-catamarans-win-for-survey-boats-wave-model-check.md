---
title: "Do catamarans beat monohulls for slow survey boats? A second wave model says no"
seo_title: "Catamaran vs monohull range for small survey vessels: Michell wave resistance check"
date: 2026-11-03
tags: [marine, research, naval-architecture, autonomy]
description: "At equal length, a catamaran out-ranged a monohull in 0 of 243 cases under Michell thin-ship wave theory and tank-bound form factors."
---

The `marine-hull` programme asks which small survey hull carries a payload furthest per kWh. One early worry was that the answer, "the monohull, at equal length", depended on a placeholder wave-resistance term and on form factors (k) taken from a wide guess.

Milestone 3k crossed the two fixes. It uses Michell thin-ship theory for waves and form factors of 0.03 to 0.15, the range implied by Delft yacht tank data. Over 729 deterministic cases the catamaran out-ranged the monohull in 7 (1.0%), and in 0 of 243 at equal length. The range ratio catamaran/monohull ran from 0.73 to 1.02, median 0.86. All 7 wins pair a 3 m monohull with a 4 or 5 m catamaran, so they reflect length, not hull type. The prediction was logged before the run.

Limits: form factors come from keeled yachts, interference and hotel load are unsourced, and the hulls are Wigley forms. Code and results are in `research/marine-hull/experiments/`.
