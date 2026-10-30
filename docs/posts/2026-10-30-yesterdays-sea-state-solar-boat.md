---
title: "A solar boat that just reads yesterday's sea keeps three quarters of the oracle's gain"
seo_title: "Persistence forecast for a solar survey boat's speed in rough water"
date: 2026-10-30
tags: [marine-hull, solar-boat, sea-state, forecasting]
description: "In the marine-hull programme, backing off speed on rough days using only yesterday's sea state recovers 68 to 80% of a perfect-foresight policy's gain over the best constant speed."
---

The [marine-hull](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) programme asks how far a small solar survey boat goes per day. Earlier steps showed a policy that slows down in rough water beats the best constant speed by 3 to 15%, but only with perfect foresight. Then a forecast of swept skill recovered under half of that.

Milestone 6e uses a forecast with no free parameter: today's call is yesterday's sea state. With rough spells averaging seven days, that is right 85% of the time, and it recovers 68 to 80% of the gap in all ten cells (five sites, two battery sizes). Its errors fall on spell boundaries and cost one day each, which is why it beats the independent-error forecast of the previous step at a similar hit rate.

One result is an artifact, and the log says so. The one-day-spell cells at p = 0.5 come from a Markov chain that alternates deterministically, so yesterday predicts today perfectly inverted. Those cells show persistence equal to the oracle, and they should not be quoted. Sea state itself is still a swept two-state model, not a wave climatology.

Log and data: `research/marine-hull/LOG.md`, `experiments/results_solar_seastate_persist.txt`.
