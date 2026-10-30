---
title: "Yesterday's sea state with three states: what a sensor-only solar boat recovers"
seo_title: "Persistence forecast for a solar boat's speed with three sea states"
date: 2026-10-30
tags: [marine-hull, solar-boat, forecasting, simulation]
description: "A boat that assumes today's sea matches yesterday's recovers a tenth of a perfect forecast's range gain on an iid sea and about 90% when its calls are right 90% of the time."
---

A 5 m, 200 kg deck-solar boat can slow down on rough days and speed up on calm ones. With perfect foresight of each day's sea state that beats the best constant speed by 3 to 6% in km/day in the [marine-hull programme](https://github.com/duncan-haywood/oss-monorepo/tree/main/research/marine-hull). A boat with only its own wave sensor can use yesterday's state as the call. Milestone 6g checks that with three states (calm, moderate, rough) instead of two, over 10 years of daily sunshine at five sites and two pack sizes.

**The numbers (30 cells).** Median share of the perfect-foresight gain: 0.10 at a hit rate of 0.34 (an iid sea, where the small gain is fitting, not skill), 0.48 at 0.67, and 0.89 at 0.90. No cell does worse than the best constant speed.

**Caveats.** The sea-state multipliers (1, 1.5, 3), their shares and the spell lengths are swept choices, not measured wave climate; one random seed; the speeds are fitted on the same days. I also expected the three-state share at long spells to fall below the two-state 0.75, and it did not (0.89), but the two chains' spell lengths differ, so that is not a clean comparison. Log and code: `research/marine-hull/LOG.md`, milestone 6g.
