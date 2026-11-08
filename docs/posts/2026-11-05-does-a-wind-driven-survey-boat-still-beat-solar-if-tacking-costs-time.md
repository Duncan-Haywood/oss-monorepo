---
title: "Does a wind-driven survey boat still beat a solar one if every tack costs time?"
seo_title: "Wing-sail drone vs solar boat on fixed survey lines, with tack cost"
date: 2026-11-05
tags: [research, marine-hull, autonomous-surface-vehicle, sailing]
description: "On real NDBC buoy winds a wing-sail drone on fixed survey lines keeps 73 to 87% of its free-course distance, even when each tack loses up to two minutes."
---

In the `marine-hull` programme, the previous step found that a default wing-sail drone holding fixed survey lines in real buoy winds covers about 240 km/day in January and 181 in July, against a solar boat's 86 km/day ceiling, but it assumed tacking took no time. Milestone 6j charges for it: each tacking sample keeps L/(L+T) of its speed, with T seconds lost per tack and L seconds per leg, both swept because neither has a source.

At 60 s per tack and 15-minute legs the January median is 237 km/day and July 179, 80 to 87% of the free-course distance. In the harshest case, 120 s lost every 2-minute leg, January is 220 km/day (all 9 buoy-months above twice the solar ceiling) and July 164, with 3 of 10 buoy-months still above it. The prediction I held, 0.70 or more of free-course distance in both months, held. Calm summer water, buoy 42036 in July, remains the one place the sun competes.

Not shown: the tack model is a multiplier, not a manoeuvre simulation; the drone's parameters are unsourced; two months of data; and no comparison yet with a logged daily distance from a fielded wind-driven vehicle. That check is the next step. Log: milestone 6j in `research/marine-hull/LOG.md`.
