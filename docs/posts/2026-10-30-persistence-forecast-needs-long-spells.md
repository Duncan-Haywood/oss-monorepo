---
title: "Does yesterday's sea state help a solar boat? Only if spells last"
seo_title: "Persistence forecast for a solar boat depends on spell length"
date: 2026-10-30
tags: [marine-hull, solar-boat, forecasting]
description: "Calling tomorrow's sea state from today's recovers 6% of a perfect forecast's gain on iid seas, 28% at 3-day spells and 75% at 7-day spells."
---

Our [marine-hull](https://duncan-haywood.github.io/oss-monorepo/research/marine-hull/) programme asks how a 5 m solar boat should set its speed when some days are rough. A boat that knows each day's sea state in advance beats its best constant speed by 3 to 10%. The cheap forecast is yesterday's sea: no external data, just the boat's own wave sensor.

Last run's version of this test had a flaw. At one-day spells the Markov chain alternates calm and rough deterministically, so "yesterday" was perfectly wrong, not uninformative. This run replaces it with a true iid sea (mean rough spell 2 days) and adds 3 days.

**The numbers** (five sites, two pack sizes, half the days rough, rough days costing three times the resistance, 30 cells):

| Mean rough spell | Hit rate | Share of the perfect-forecast gain |
|---|---|---|
| 2 days (iid) | 0.50 | 0.06 (median) |
| 3 days | 0.67 | 0.28 |
| 7 days | 0.85 | 0.75 |

On an iid sea persistence is worth nothing; the 0.06 is the speed pair fitted in-sample. Whether a wave sensor is enough depends on how long rough spells last, and we found no wave climatology reachable to say. The spell length is swept, not sourced, and the chain has two states and one seed. Log and script are in the project's `LOG.md` and `experiments/`.
