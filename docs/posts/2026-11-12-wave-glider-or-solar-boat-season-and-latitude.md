---
title: "Wave Glider or solar boat? The answer flips with the season"
seo_title: "Wave Glider vs solar-powered survey boat: km/day by site and month"
date: 2026-11-12
tags: [research, marine-hull]
description: "With each site's own sunlight, a 4 m solar survey boat beats a 2015 Wave Glider at all five sites in July and loses at four of five in January."
---

The last post planned a Wave Glider's distance per day from ERA5 wave data over the whole ocean: 50 to 79 km/day at the 2015 vehicle's best month. It compared that with "the 86 km/day deck-solar ceiling" and found no ocean point above it. That 86 was one number for every place and season: a 4 m solar boat's best-range speed of 1 m/s, held for 24 hours. A solar boat's range depends on how much sun it gets, so a fixed figure was never a fair comparison.

So this step swaps the fixed figure for each site's own sunlight. NASA POWER's daily all-sky surface sunlight for the programme's five corridor sites (equatorial Pacific, Florida Straits, Gulf of Maine, North Sea, Gulf of Alaska) was already in the repository for January and July 2024, the same months as the wave plan. We swept 54 boat designs: 3 to 5 m long, 20 to 40 W of payload and electronics, and a range of panel efficiencies and losses. For each we computed the fastest speed the panels can sustain indefinitely. We wrote eight predictions down and committed them before running.

What came out:

- **A cliff, not a ceiling.** The central 4 m boat with a 30 W payload breaks even on its payload alone at about **153 W/m2** of daily-mean sunlight. Below that it sustains 0 km/day. Above it, speed climbs fast, because propulsion power grows roughly with the cube of speed and the first bit of spare power buys a lot of speed. At 175 W/m2 it does 58 km/day, at 247 W/m2 it does 96, and at the best July site 103.
- **July: the solar boat wins everywhere.** At all five sites it beats the Wave Glider's best-state plan, 58 to 103 km/day against 44 to 55.
- **January: the Wave Glider wins at four of five.** The equator is the exception (96 against 45). At the North Sea (22 W/m2) and the Gulf of Alaska (14 W/m2), none of the 54 solar boats can sustain any speed, while the Wave Glider plans 58 to 75 km/day in the winter storm seas.
- **Overall it's close.** Over all 540 boat-site-months, the Wave Glider's best state wins 62% of them. Big hulls with light payloads (5 m, 20 W) beat it in 70% of site-months; small hulls with heavy payloads almost never do.
- **The battery matters near the cliff.** If the solar boat starts the month with a full 10 kWh pack, it goes 1.2 to 1.6 times as far as panels alone allow. That's more than we predicted, and it carries the central boat at 78 km/day through a Florida January, where panels alone give zero.

So "which goes further" has no single answer. It depends on the season and latitude more than on the vehicle. The previous post said a Wave Glider's case against a solar boat is endurance and weather, not distance. That holds in summer and in the tropics. In the winter storm belts above about 40 degrees, the Wave Glider also wins on distance.

There's one big caveat. The Wave Glider's payload runs on solar panels too, and in a North Sea January the same deck area yields about 4 W. Neither vehicle runs a 30 W sensor package there without a battery. The solar boat here is also modelled in calm water, and the winter sites are exactly where waves would add drag. Putting both vehicles on the same payload power budget, and adding wave drag to the solar side, are the next steps. The code, the pre-registered predictions and the results file are in `research/marine-hull/` (milestone 6y).

*Written with AI assistance (Claude Code).*
